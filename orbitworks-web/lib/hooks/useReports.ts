"use client";

import { useCallback, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import type {
  ClockEvent,
  EmployeeSummary,
  AttendanceStats,
  TimeTrendsPoint,
  EmployeesPerDayPoint,
  JobSiteReport,
  SessionRecord,
  EmployeeExportRecord,
  AttendanceRecord,
  ShiftNote,
} from "@/lib/types";
import {
  dateKey,
  startOfWeek,
  minutesSinceMidnight,
  parseTimeToMinutes,
  formatMinutesAsTime,
} from "@/lib/reportUtils";

type EventWithDate = ClockEvent & { timestamp: Timestamp };

export function useReports() {
  const { userData } = useAuth();
  const { settings } = useCompanySettings();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summaries, setSummaries] = useState<EmployeeSummary[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceStats | null>(null);
  const [hoursPerWeek, setHoursPerWeek] = useState<TimeTrendsPoint[]>([]);
  const [employeesPerDay, setEmployeesPerDay] = useState<EmployeesPerDayPoint[]>([]);
  const [avgHoursPerEmployee, setAvgHoursPerEmployee] = useState(0);
  const [jobSiteReports, setJobSiteReports] = useState<JobSiteReport[]>([]);
  const [activeJobSiteCount, setActiveJobSiteCount] = useState(0);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [employeeRecords, setEmployeeRecords] = useState<EmployeeExportRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [shiftNotes, setShiftNotes] = useState<ShiftNote[]>([]);

  const runReport = useCallback(
    async (startDate: string, endDate: string) => {
      if (!userData?.companyId) return;
      setError("");
      setLoading(true);
      setSummaries(null);

      try {
        const start = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T23:59:59");

        const eventsRef = collection(db, "companies", userData.companyId, "clockEvents");
        const q = query(
          eventsRef,
          where("timestamp", ">=", Timestamp.fromDate(start)),
          where("timestamp", "<=", Timestamp.fromDate(end)),
          orderBy("timestamp", "asc")
        );
        const snapshot = await getDocs(q);
        const events = snapshot.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<EventWithDate, "id">) })
        );

        const employeesRef = collection(db, "companies", userData.companyId, "employees");
        const employeesSnapshot = await getDocs(employeesRef);
        const rateByEmployeeId = new Map<string, number | null>();
        employeesSnapshot.docs.forEach((d) => {
          const data = d.data() as { hourlyRate?: number | null };
          rateByEmployeeId.set(d.id, data.hourlyRate ?? null);
        });

        const sitesRef = collection(db, "companies", userData.companyId, "jobSites");
        const sitesSnapshot = await getDocs(sitesRef);
        let activeSites = 0;
        const siteNameByIdAll = new Map<string, string>();
        sitesSnapshot.docs.forEach((d) => {
          const data = d.data() as { name?: string; active?: boolean };
          siteNameByIdAll.set(d.id, data.name ?? "Unknown site");
          if (data.active) activeSites += 1;
        });
        setActiveJobSiteCount(activeSites);

        // ---- Employee roster export (independent of date range) ----
        const employeeRecordsOut: EmployeeExportRecord[] = employeesSnapshot.docs.map((d) => {
          const data = d.data() as {
            name?: string;
            jobTitle?: string;
            hourlyRate?: number | null;
            phone?: string;
            active?: boolean;
            assignedSiteIds?: string[];
          };
          const siteNames = (data.assignedSiteIds ?? [])
            .map((id) => siteNameByIdAll.get(id) ?? "Unknown site")
            .join("; ");
          return {
            id: d.id,
            name: data.name ?? "",
            jobTitle: data.jobTitle ?? "",
            hourlyRate: data.hourlyRate ?? null,
            phone: data.phone ?? "",
            active: data.active ?? true,
            siteNames,
          };
        });
        setEmployeeRecords(employeeRecordsOut);

        // ---- Shift notes (supervisor-written, scoped to the same date range) ----
        const usersRef = collection(db, "users");
        const usersQuery = query(usersRef, where("companyId", "==", userData.companyId));
        const usersSnapshot = await getDocs(usersQuery);
        const nameByUid = new Map<string, string>();
        usersSnapshot.docs.forEach((d) => {
          const data = d.data() as { name?: string };
          nameByUid.set(d.id, data.name ?? "Unknown");
        });

        const notesRef = collection(db, "companies", userData.companyId, "shiftNotes");
        const notesQuery = query(
          notesRef,
          where("timestamp", ">=", Timestamp.fromDate(start)),
          where("timestamp", "<=", Timestamp.fromDate(end)),
          orderBy("timestamp", "asc")
        );
        const notesSnapshot = await getDocs(notesQuery);
        const shiftNotesOut: ShiftNote[] = notesSnapshot.docs.map((d) => {
          const data = d.data() as {
            note?: string;
            siteId?: string | null;
            siteName?: string;
            createdByUid?: string;
            timestamp?: Timestamp;
          };
          return {
            id: d.id,
            note: data.note ?? "",
            siteId: data.siteId ?? null,
            siteName: data.siteName ?? "Not specified",
            createdByUid: data.createdByUid ?? "",
            createdByName: nameByUid.get(data.createdByUid ?? "") ?? "Unknown",
            timestamp: data.timestamp,
          };
        });
        setShiftNotes(shiftNotesOut);

        // ---- Payroll summaries + sessions + weekly hours buckets ----
        const byEmployee = new Map<string, EventWithDate[]>();
        for (const event of events) {
          const list = byEmployee.get(event.employeeId) ?? [];
          list.push(event);
          byEmployee.set(event.employeeId, list);
        }

        const results: EmployeeSummary[] = [];
        const weeklyHoursTotals = new Map<string, number>();
        const weeklyHoursEmployees = new Map<string, Set<string>>();
        const siteHoursTotal = new Map<string, number>();
        const sessionsOut: SessionRecord[] = [];

        for (const [employeeId, employeeEvents] of byEmployee) {
          let totalMs = 0;
          let sessionCount = 0;
          let openSessions = 0;
          let pendingIn: EventWithDate | null = null;

          for (const event of employeeEvents) {
            if (event.type === "in") {
              if (pendingIn) {
                openSessions += 1;
                sessionsOut.push({
                  employeeId,
                  employeeName: pendingIn.employeeName,
                  siteName: pendingIn.siteName,
                  clockIn: pendingIn.timestamp.toDate().toISOString(),
                  clockOut: null,
                  hours: null,
                  clockInPhotoUrl: pendingIn.photoUrl,
                });
              }
              pendingIn = event;
            } else if (event.type === "out" && pendingIn) {
              const durationMs = event.timestamp.toMillis() - pendingIn.timestamp.toMillis();
              if (durationMs > 0) {
                totalMs += durationMs;
                sessionCount += 1;

                const hrs = durationMs / (1000 * 60 * 60);
                sessionsOut.push({
                  employeeId,
                  employeeName: pendingIn.employeeName,
                  siteName: pendingIn.siteName,
                  clockIn: pendingIn.timestamp.toDate().toISOString(),
                  clockOut: event.timestamp.toDate().toISOString(),
                  hours: hrs,
                  clockInPhotoUrl: pendingIn.photoUrl,
                  clockOutPhotoUrl: event.photoUrl,
                });

                const weekKey = dateKey(startOfWeek(pendingIn.timestamp.toDate()));
                weeklyHoursTotals.set(weekKey, (weeklyHoursTotals.get(weekKey) ?? 0) + hrs);
                const empSet = weeklyHoursEmployees.get(weekKey) ?? new Set<string>();
                empSet.add(employeeId);
                weeklyHoursEmployees.set(weekKey, empSet);

                if (pendingIn.siteId) {
                  siteHoursTotal.set(
                    pendingIn.siteId,
                    (siteHoursTotal.get(pendingIn.siteId) ?? 0) + hrs
                  );
                }
              }
              pendingIn = null;
            }
          }
          if (pendingIn) {
            openSessions += 1;
            sessionsOut.push({
              employeeId,
              employeeName: pendingIn.employeeName,
              siteName: pendingIn.siteName,
              clockIn: pendingIn.timestamp.toDate().toISOString(),
              clockOut: null,
              hours: null,
              clockInPhotoUrl: pendingIn.photoUrl,
            });
          }

          const totalHours = totalMs / (1000 * 60 * 60);
          const hourlyRate = rateByEmployeeId.get(employeeId) ?? null;

          results.push({
            employeeId,
            employeeName: employeeEvents[0].employeeName,
            totalHours,
            sessionCount,
            openSessions,
            hourlyRate,
            estimatedPay: hourlyRate != null ? totalHours * hourlyRate : null,
          });
        }
        results.sort((a, b) => b.totalHours - a.totalHours);
        setSummaries(results);

        sessionsOut.sort((a, b) => (a.clockIn < b.clockIn ? -1 : 1));
        setSessions(sessionsOut);

        const totalHoursAll = results.reduce((sum, s) => sum + s.totalHours, 0);
        setAvgHoursPerEmployee(results.length > 0 ? totalHoursAll / results.length : 0);

        const weekPoints: TimeTrendsPoint[] = Array.from(weeklyHoursTotals.entries())
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([weekKey, total]) => {
            const empCount = weeklyHoursEmployees.get(weekKey)?.size ?? 1;
            const label = new Date(weekKey + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            return { weekLabel: label, avgHours: total / empCount };
          });
        setHoursPerWeek(weekPoints);

        // ---- Attendance + employees/day + job sites ----
        const byEmployeeDay = new Map<string, EventWithDate[]>();
        for (const event of events) {
          const day = dateKey(event.timestamp.toDate());
          const key = `${event.employeeId}__${day}`;
          const list = byEmployeeDay.get(key) ?? [];
          list.push(event);
          byEmployeeDay.set(key, list);
        }

        const openMinutes = parseTimeToMinutes(settings.businessHours.open);
        const grace = settings.attendanceRules.gracePeriodMinutes ?? 0;
        const threshold = openMinutes + grace;

        let onTime = 0;
        let late = 0;
        const arrivalMinutesList: number[] = [];
        const departureMinutesList: number[] = [];
        const employeesByDay = new Map<string, Set<string>>();
        const attendanceRecordsOut: AttendanceRecord[] = [];

        const siteEmployeeIds = new Map<string, Set<string>>();
        const siteOnTime = new Map<string, number>();
        const siteArrivals = new Map<string, number>();
        const siteNames = new Map<string, string>();

        for (const [key, dayEvents] of byEmployeeDay) {
          const [employeeId, day] = key.split("__");
          const sorted = [...dayEvents].sort(
            (a, b) => a.timestamp.toMillis() - b.timestamp.toMillis()
          );
          const firstIn = sorted.find((e) => e.type === "in");
          const lastOut = [...sorted].reverse().find((e) => e.type === "out");

          const daySet = employeesByDay.get(day) ?? new Set<string>();
          daySet.add(employeeId);
          employeesByDay.set(day, daySet);

          if (firstIn) {
            const arrivalMin = minutesSinceMidnight(firstIn.timestamp.toDate());
            arrivalMinutesList.push(arrivalMin);
            const isOnTime = arrivalMin <= threshold;
            if (isOnTime) onTime += 1;
            else late += 1;

            attendanceRecordsOut.push({
              employeeId,
              employeeName: firstIn.employeeName,
              date: day,
              arrivalTime: formatMinutesAsTime(arrivalMin),
              departureTime: lastOut
                ? formatMinutesAsTime(minutesSinceMidnight(lastOut.timestamp.toDate()))
                : null,
              status: isOnTime ? "On Time" : "Late",
            });

            if (firstIn.siteId) {
              siteNames.set(firstIn.siteId, firstIn.siteName);
              const set = siteEmployeeIds.get(firstIn.siteId) ?? new Set<string>();
              set.add(employeeId);
              siteEmployeeIds.set(firstIn.siteId, set);

              siteArrivals.set(firstIn.siteId, (siteArrivals.get(firstIn.siteId) ?? 0) + 1);
              if (isOnTime) {
                siteOnTime.set(firstIn.siteId, (siteOnTime.get(firstIn.siteId) ?? 0) + 1);
              }
            }
          }
          if (lastOut) {
            departureMinutesList.push(minutesSinceMidnight(lastOut.timestamp.toDate()));
          }
        }

        attendanceRecordsOut.sort((a, b) => (a.date < b.date ? -1 : 1));
        setAttendanceRecords(attendanceRecordsOut);

        const totalArrivals = onTime + late;
        setAttendance({
          onTimeCount: onTime,
          lateCount: late,
          onTimePercent: totalArrivals > 0 ? (onTime / totalArrivals) * 100 : 0,
          latePercent: totalArrivals > 0 ? (late / totalArrivals) * 100 : 0,
          avgArrivalMinutes:
            arrivalMinutesList.length > 0
              ? arrivalMinutesList.reduce((a, b) => a + b, 0) / arrivalMinutesList.length
              : null,
          avgDepartureMinutes:
            departureMinutesList.length > 0
              ? departureMinutesList.reduce((a, b) => a + b, 0) / departureMinutesList.length
              : null,
        });

        const dayPoints: EmployeesPerDayPoint[] = Array.from(employeesByDay.entries())
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([day, set]) => ({
            date: new Date(day + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            employeeCount: set.size,
          }));
        setEmployeesPerDay(dayPoints);

        const siteReports: JobSiteReport[] = Array.from(siteEmployeeIds.entries())
          .map(([siteId, empSet]) => {
            const arrivals = siteArrivals.get(siteId) ?? 0;
            const onTimeAtSite = siteOnTime.get(siteId) ?? 0;
            const hours = siteHoursTotal.get(siteId) ?? 0;
            return {
              siteId,
              siteName: siteNames.get(siteId) ?? "Unknown site",
              employeeCount: empSet.size,
              avgHours: empSet.size > 0 ? hours / empSet.size : 0,
              onTimePercent: arrivals > 0 ? (onTimeAtSite / arrivals) * 100 : 0,
            };
          })
          .sort((a, b) => b.employeeCount - a.employeeCount);
        setJobSiteReports(siteReports);
      } catch (err) {
        console.error("Report generation error:", err);
        setError("Couldn't generate the report. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [userData?.companyId, settings.businessHours.open, settings.attendanceRules.gracePeriodMinutes]
  );

  return {
    loading,
    error,
    summaries,
    attendance,
    hoursPerWeek,
    employeesPerDay,
    avgHoursPerEmployee,
    jobSiteReports,
    activeJobSiteCount,
    sessions,
    employeeRecords,
    attendanceRecords,
    shiftNotes,
    runReport,
  };
}
