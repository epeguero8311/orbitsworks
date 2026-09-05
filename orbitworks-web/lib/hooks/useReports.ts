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
  Job,
} from "@/lib/types";
import {
  dateKey,
  startOfWeek,
  minutesSinceMidnight,
  parseTimeToMinutes,
  formatMinutesAsTime,
  APPROVALS_CUTOVER_DATE,
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employeeJobIdById, setEmployeeJobIdById] = useState<Map<string, string | null>>(
    new Map()
  );
  const [hoursByEmployeeDay, setHoursByEmployeeDay] = useState<Map<string, number>>(
    new Map()
  );
  const [breakHoursByEmployeeDay, setBreakHoursByEmployeeDay] = useState<Map<string, number>>(
    new Map()
  );

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
        const events = snapshot.docs.map((d) => {
          const data = d.data() as Omit<EventWithDate, "id">;
          // Reports use the corrected time when a clock event has been
          // adjusted by an admin, so payroll/hours/attendance reflect
          // corrections. The date-range query filter above still runs on
          // the original (unadjusted) timestamp so a correction can't
          // move an event in or out of the selected report window.
          const effectiveTimestamp = data.adjustedTimestamp ?? data.timestamp;
          return { id: d.id, ...data, timestamp: effectiveTimestamp };
        });

        // ---- Timesheet approval gating ----
        // A session (clock-in, any breaks, clock-out) whose clock-in date is
        // on/after APPROVALS_CUTOVER_DATE must be explicitly approved on the
        // Timesheet Approvals page to count anywhere in this report/export.
        // Sessions before the cutover have no timesheetApprovals doc at all
        // and are included exactly as they always were - this only ever
        // restricts data from the cutover forward, never touches history.
        const approvalsRef = collection(db, "companies", userData.companyId, "timesheetApprovals");
        const approvalsQuery = query(
          approvalsRef,
          where("date", ">=", APPROVALS_CUTOVER_DATE),
          where("date", "<=", endDate)
        );
        const approvalsSnapshot = await getDocs(approvalsQuery);
        const approvalStatusByClockInId = new Map<string, "pending" | "approved">();
        approvalsSnapshot.docs.forEach((d) => {
          const data = d.data() as { status?: "pending" | "approved" };
          approvalStatusByClockInId.set(d.id, data.status ?? "pending");
        });

        // Walk each employee's events chronologically and mark every event
        // in an unapproved on/after-cutover session (in, any breakStart/
        // breakEnd, and out if present) for exclusion. Sessions before the
        // cutover are never marked, regardless of whether an approval doc
        // happens to exist for them.
        const excludedEventIds = new Set<string>();
        const eventsByEmployeeForGating = new Map<string, EventWithDate[]>();
        for (const event of events) {
          const list = eventsByEmployeeForGating.get(event.employeeId) ?? [];
          list.push(event);
          eventsByEmployeeForGating.set(event.employeeId, list);
        }
        eventsByEmployeeForGating.forEach((employeeEvents) => {
          let sessionIds: string[] = [];
          let sessionClockInId: string | null = null;
          let sessionRequiresApproval = false;

          const closeSession = () => {
            if (sessionClockInId && sessionRequiresApproval) {
              const status = approvalStatusByClockInId.get(sessionClockInId);
              if (status !== "approved") {
                sessionIds.forEach((id) => excludedEventIds.add(id));
              }
            }
          };

          for (const event of employeeEvents) {
            if (event.type === "in") {
              closeSession();
              sessionIds = [event.id];
              sessionClockInId = event.id;
              sessionRequiresApproval =
                dateKey(event.timestamp.toDate()) >= APPROVALS_CUTOVER_DATE;
            } else if (sessionClockInId) {
              sessionIds.push(event.id);
              if (event.type === "out") {
                closeSession();
                sessionIds = [];
                sessionClockInId = null;
                sessionRequiresApproval = false;
              }
            }
          }
          closeSession();
        });

        const gatedEvents = events.filter((event) => !excludedEventIds.has(event.id));

        const employeesRef = collection(db, "companies", userData.companyId, "employees");
        const employeesSnapshot = await getDocs(employeesRef);

        // ---- Jobs (name + live hourly rate) ----
        const jobsRef = collection(db, "companies", userData.companyId, "jobs");
        const jobsSnapshot = await getDocs(jobsRef);
        const jobsMap = new Map<string, Job>();
        jobsSnapshot.docs.forEach((d) => {
          const data = d.data() as Omit<Job, "id">;
          jobsMap.set(d.id, { id: d.id, ...data });
        });
        setJobs(Array.from(jobsMap.values()));

        // Resolve each employee's default rate: a linked job's live rate
        // takes priority over any custom rate typed on the employee. Also
        // resolve each employee's CURRENT subcontractor assignment - used
        // to group the Summary/Payroll/Employees sheets by company. This
        // is the employee's present-day company, not a historical one -
        // Detail/Attendance use the per-event snapshot instead, which is
        // what stays correct if someone gets reassigned mid-period.
        const employeeJobIdByIdOut = new Map<string, string | null>();
        const defaultRateByEmployeeId = new Map<string, number | null>();
        const subcontractorByEmployeeId = new Map<string, { id: string | null; name: string | null }>();
        employeesSnapshot.docs.forEach((d) => {
          const data = d.data() as {
            hourlyRate?: number | null;
            jobId?: string | null;
            subcontractorId?: string | null;
            subcontractorName?: string | null;
          };
          const jobId = data.jobId ?? null;
          employeeJobIdByIdOut.set(d.id, jobId);
          const rate = jobId
            ? jobsMap.get(jobId)?.hourlyRate ?? null
            : data.hourlyRate ?? null;
          defaultRateByEmployeeId.set(d.id, rate);
          subcontractorByEmployeeId.set(d.id, {
            id: data.subcontractorId ?? null,
            name: data.subcontractorName ?? null,
          });
        });
        setEmployeeJobIdById(employeeJobIdByIdOut);

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
            jobId?: string | null;
            hourlyRate?: number | null;
            phone?: string;
            active?: boolean;
            assignedSiteIds?: string[];
            subcontractorName?: string | null;
          };
          const siteNames = (data.assignedSiteIds ?? [])
            .map((id) => siteNameByIdAll.get(id) ?? "Unknown site")
            .join("; ");
          const jobTitle = data.jobId
            ? jobsMap.get(data.jobId)?.name ?? data.jobTitle ?? ""
            : data.jobTitle ?? "";
          return {
            id: d.id,
            name: data.name ?? "",
            jobTitle,
            hourlyRate: defaultRateByEmployeeId.get(d.id) ?? null,
            phone: data.phone ?? "",
            active: data.active ?? true,
            siteNames,
            subcontractorName: data.subcontractorName ?? undefined,
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
        for (const event of gatedEvents) {
          const list = byEmployee.get(event.employeeId) ?? [];
          list.push(event);
          byEmployee.set(event.employeeId, list);
        }

        const results: EmployeeSummary[] = [];
        const weeklyHoursTotals = new Map<string, number>();
        const weeklyHoursEmployees = new Map<string, Set<string>>();
        const siteHoursTotal = new Map<string, number>();
        const sessionsOut: SessionRecord[] = [];
        const hoursByDayOut = new Map<string, number>();
        const breakHoursByDayOut = new Map<string, number>();

        for (const [employeeId, employeeEvents] of byEmployee) {
          let totalMs = 0;
          let totalBreakMs = 0;
          let sessionCount = 0;
          let openSessions = 0;
          let pendingIn: EventWithDate | null = null;
          // Tracks an in-progress break within the current in->out session.
          // currentSessionBreakMs accumulates every breakStart/breakEnd pair
          // seen since the last "in", and gets attributed to that session
          // the moment the matching "out" closes it.
          let openBreakStart: EventWithDate | null = null;
          let currentSessionBreakMs = 0;
          // Sessions/Detail use the employee current company assignment
          // for consistency with Summary/Payroll/Employees, rather than
          // whatever was snapshotted on the clock event itself - older
          // events created before a reassignment would otherwise show
          // stale company info and look inconsistent across sheets.
          const currentCompany = subcontractorByEmployeeId.get(employeeId) ?? {
            id: null,
            name: null,
          };

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
                  breakHours: null,
                  clockInPhotoUrl: pendingIn.photoUrl,
                  subcontractorId: currentCompany.id,
                  subcontractorName: currentCompany.name,
                });
              }
              pendingIn = event;
              openBreakStart = null;
              currentSessionBreakMs = 0;
            } else if (event.type === "breakStart") {
              if (pendingIn && !openBreakStart) {
                openBreakStart = event;
              }
            } else if (event.type === "breakEnd") {
              if (openBreakStart) {
                const breakMs = event.timestamp.toMillis() - openBreakStart.timestamp.toMillis();
                if (breakMs > 0) currentSessionBreakMs += breakMs;
                openBreakStart = null;
              }
            } else if (event.type === "out" && pendingIn) {
              const durationMs = event.timestamp.toMillis() - pendingIn.timestamp.toMillis();
              if (durationMs > 0) {
                totalMs += durationMs;
                totalBreakMs += currentSessionBreakMs;
                sessionCount += 1;

                const hrs = durationMs / (1000 * 60 * 60);
                const breakHrs = currentSessionBreakMs / (1000 * 60 * 60);
                sessionsOut.push({
                  employeeId,
                  employeeName: pendingIn.employeeName,
                  siteName: pendingIn.siteName,
                  clockIn: pendingIn.timestamp.toDate().toISOString(),
                  clockOut: event.timestamp.toDate().toISOString(),
                  hours: hrs,
                  breakHours: breakHrs,
                  clockInPhotoUrl: pendingIn.photoUrl,
                  clockOutPhotoUrl: event.photoUrl,
                  subcontractorId: currentCompany.id,
                  subcontractorName: currentCompany.name,
                });

                const weekKey = dateKey(startOfWeek(pendingIn.timestamp.toDate()));
                weeklyHoursTotals.set(weekKey, (weeklyHoursTotals.get(weekKey) ?? 0) + hrs);
                const empSet = weeklyHoursEmployees.get(weekKey) ?? new Set<string>();
                empSet.add(employeeId);
                weeklyHoursEmployees.set(weekKey, empSet);

                const dayKey = dateKey(pendingIn.timestamp.toDate());
                const hbdKey = `${employeeId}__${dayKey}`;
                hoursByDayOut.set(hbdKey, (hoursByDayOut.get(hbdKey) ?? 0) + hrs);
                breakHoursByDayOut.set(hbdKey, (breakHoursByDayOut.get(hbdKey) ?? 0) + breakHrs);

                if (pendingIn.siteId) {
                  siteHoursTotal.set(
                    pendingIn.siteId,
                    (siteHoursTotal.get(pendingIn.siteId) ?? 0) + hrs
                  );
                }
              }
              pendingIn = null;
              openBreakStart = null;
              currentSessionBreakMs = 0;
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
              breakHours: null,
              clockInPhotoUrl: pendingIn.photoUrl,
              subcontractorId: currentCompany.id,
              subcontractorName: currentCompany.name,
            });
          }

          const totalHours = totalMs / (1000 * 60 * 60);
          const totalBreakHours = totalBreakMs / (1000 * 60 * 60);
          const netHours = totalHours - totalBreakHours;
          const hourlyRate = defaultRateByEmployeeId.get(employeeId) ?? null;
          const subcontractor = subcontractorByEmployeeId.get(employeeId) ?? {
            id: null,
            name: null,
          };

          results.push({
            employeeId,
            employeeName: employeeEvents[0].employeeName,
            totalHours,
            totalBreakHours,
            sessionCount,
            openSessions,
            hourlyRate,
            estimatedPay: hourlyRate != null ? netHours * hourlyRate : null,
            subcontractorId: subcontractor.id,
            subcontractorName: subcontractor.name,
          });
        }
        results.sort((a, b) => b.totalHours - a.totalHours);
        setSummaries(results);
        setHoursByEmployeeDay(hoursByDayOut);
        setBreakHoursByEmployeeDay(breakHoursByDayOut);

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
        for (const event of gatedEvents) {
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

          // Break time for the day, independent of the payroll session
          // pairing above - just sums every breakStart->breakEnd pair that
          // falls on this calendar day.
          let dayBreakMs = 0;
          let openBreakStartDay: EventWithDate | null = null;
          for (const ev of sorted) {
            if (ev.type === "breakStart" && !openBreakStartDay) {
              openBreakStartDay = ev;
            } else if (ev.type === "breakEnd" && openBreakStartDay) {
              dayBreakMs += ev.timestamp.toMillis() - openBreakStartDay.timestamp.toMillis();
              openBreakStartDay = null;
            }
          }
          const dayBreakHours = dayBreakMs / (1000 * 60 * 60);

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
              breakHours: dayBreakHours,
              status: isOnTime ? "On Time" : "Late",
              subcontractorName: subcontractorByEmployeeId.get(employeeId)?.name ?? null,
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
    jobs,
    employeeJobIdById,
    hoursByEmployeeDay,
    breakHoursByEmployeeDay,
    runReport,
  };
}