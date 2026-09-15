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
import { APPROVALS_CUTOVER_DATE } from "@/lib/reportUtils";
import {
  type EventWithDate,
  computeExcludedEventIds,
  buildEmployeeDerivedMaps,
  buildEmployeeExportRecords,
  buildShiftNotes,
  computePayrollAndSessions,
  computeAttendanceAndSiteReports,
} from "@/lib/reportComputations";

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

        const excludedEventIds = computeExcludedEventIds(events, approvalStatusByClockInId);
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

        const { employeeJobIdById: employeeJobIdByIdOut, defaultRateByEmployeeId, subcontractorByEmployeeId } =
          buildEmployeeDerivedMaps(employeesSnapshot.docs, jobsMap);
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

        setEmployeeRecords(
          buildEmployeeExportRecords(
            employeesSnapshot.docs,
            jobsMap,
            siteNameByIdAll,
            defaultRateByEmployeeId
          )
        );

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
        setShiftNotes(buildShiftNotes(notesSnapshot.docs, nameByUid));

        const payroll = computePayrollAndSessions(
          gatedEvents,
          subcontractorByEmployeeId,
          defaultRateByEmployeeId
        );
        setSummaries(payroll.summaries);
        setHoursByEmployeeDay(payroll.hoursByEmployeeDay);
        setBreakHoursByEmployeeDay(payroll.breakHoursByEmployeeDay);
        setSessions(payroll.sessions);
        setAvgHoursPerEmployee(payroll.avgHoursPerEmployee);
        setHoursPerWeek(payroll.hoursPerWeek);

        const attendanceResult = computeAttendanceAndSiteReports(
          gatedEvents,
          payroll.siteHoursTotal,
          subcontractorByEmployeeId,
          settings.businessHours.open,
          settings.attendanceRules.gracePeriodMinutes ?? 0
        );
        setAttendanceRecords(attendanceResult.attendanceRecords);
        setAttendance(attendanceResult.attendance);
        setEmployeesPerDay(attendanceResult.employeesPerDay);
        setJobSiteReports(attendanceResult.jobSiteReports);
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
