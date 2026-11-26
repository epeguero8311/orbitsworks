"use client";

import { useCallback, useRef, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { fetchShiftData, type DocLike, type ShiftDataResult } from "@/lib/shiftData";
import { useAuth } from "@/lib/AuthContext";
import { useCompanySettings, overtimeSettingsFrom } from "@/lib/hooks/useCompanySettings";
import { overtimeWeekKey } from "@/lib/overtime";
import {
  buildOvertimeReportRows,
  pairReportShifts,
  type OvertimeReportRow,
  type ReportEmployee,
} from "@/lib/reportOvertime";
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
  SiteExit,
  Job,
} from "@/lib/types";
import { ALL_COMPANIES, companyMatches, type CompanyFilter } from "@/lib/reportCompanyFilter";
import { APPROVALS_CUTOVER_DATE } from "@/lib/reportUtils";
import { approvalsQueryStart } from "@/lib/approvalsWindow";
import {
  type EventWithDate,
  computeExcludedEventIds,
  buildEmployeeDerivedMaps,
  buildEmployeeExportRecords,
  buildShiftNotes,
  computePayrollAndSessions,
  computeAttendanceAndSiteReports,
} from "@/lib/reportComputations";
import { toastIfPermissionDenied } from "@/lib/permissionErrors";

// Everything one report run produces (Task 4: computed once per source).
export type ReportData = {
  summaries: EmployeeSummary[];
  attendance: AttendanceStats | null;
  hoursPerDay: TimeTrendsPoint[];
  employeesPerDay: EmployeesPerDayPoint[];
  avgHoursPerEmployee: number;
  jobSiteReports: JobSiteReport[];
  activeJobSiteCount: number;
  sessions: SessionRecord[];
  employeeRecords: EmployeeExportRecord[];
  attendanceRecords: AttendanceRecord[];
  shiftNotes: ShiftNote[];
  siteExits: SiteExit[];
  jobs: Job[];
  employeeJobIdById: Map<string, string | null>;
  hoursByEmployeeDay: Map<string, number>;
  breakHoursByEmployeeDay: Map<string, number>;
  tipsByEmployeeDay: Map<string, number>;
  approvedJobIdByEmployeeDay: Map<string, string | null>;
  overtimeRows: OvertimeReportRow[] | null;
  // Task 4 rule 2: a restricted admin's employee-days' FULL (all sites)
  // worked + OT minutes, "employeeId__date" -> totals. null otherwise.
  allSitesDayTotals: Map<string, { workedMinutes: number; overtimeMinutes: number }> | null;
};

export function useReports() {
  const { userData } = useAuth();
  const { settings } = useCompanySettings();
  const companyId = userData?.companyId;
  const { serverReads } = useAdminAccess();

  // Task 4: the server data for a restricted admin's report - the widest
  // window any part of the report reads (the OT week before startDate).
  const overtimeWeekStartsOn = settings.overtimeWeekStartsOn;
  const loadServerReportData = useCallback(async (
    purpose: "shifts" | "export",
    startDate: string,
    endDate: string,
    start: Date,
    end: Date
  ): Promise<ShiftDataResult> => {
    const wideStart = new Date(`${overtimeWeekKey(startDate, overtimeWeekStartsOn)}T00:00:00`);
    wideStart.setDate(wideStart.getDate() - 1);
    if (wideStart > start) wideStart.setTime(start.getTime());
    const wideEnd = new Date(end);
    wideEnd.setDate(wideEnd.getDate() + 1);
    const wideStartKey = `${wideStart.getFullYear()}-${String(wideStart.getMonth() + 1).padStart(2, "0")}-${String(wideStart.getDate()).padStart(2, "0")}`;
    const approvalsStart = approvalsQueryStart(wideStartKey < startDate ? wideStartKey : startDate, APPROVALS_CUTOVER_DATE);
    const [shiftsPart, notesPart] = await Promise.all([
      fetchShiftData({
        purpose,
        startMs: wideStart.getTime(),
        endMs: wideEnd.getTime(),
        startDate: approvalsStart,
        endDate,
        want: { clockEvents: true, approvals: true, overtime: purpose === "shifts" },
      }),
      fetchShiftData({ purpose, startMs: start.getTime(), endMs: end.getTime(), want: { shiftNotes: true, siteExits: true } }),
    ]);
    return { ...shiftsPart, shiftNotes: notesPart.shiftNotes, siteExits: notesPart.siteExits };
  }, [overtimeWeekStartsOn]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summaries, setSummaries] = useState<EmployeeSummary[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceStats | null>(null);
  const [hoursPerDay, setHoursPerDay] = useState<TimeTrendsPoint[]>([]);
  const [employeesPerDay, setEmployeesPerDay] = useState<EmployeesPerDayPoint[]>([]);
  const [avgHoursPerEmployee, setAvgHoursPerEmployee] = useState(0);
  const [jobSiteReports, setJobSiteReports] = useState<JobSiteReport[]>([]);
  const [activeJobSiteCount, setActiveJobSiteCount] = useState(0);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [employeeRecords, setEmployeeRecords] = useState<EmployeeExportRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [shiftNotes, setShiftNotes] = useState<ShiftNote[]>([]);
  // Phase 9 (H7 a): job site exits that started in the range (Reports
  // table, Excel Detail columns + "Job site exits" sheet).
  const [siteExits, setSiteExits] = useState<SiteExit[]>([]);
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
  // Tips (Task 3): dollars per "employeeId__date" (empty while Tips is OFF).
  const [tipsByEmployeeDay, setTipsByEmployeeDay] = useState<Map<string, number>>(new Map());
  const [approvedJobIdByEmployeeDay, setApprovedJobIdByEmployeeDay] = useState<
    Map<string, string | null>
  >(new Map());
  // Overtime (Task 1): day rows with Overtime, only when the company's
  // Overtime toggle is ON. null = OFF - every section and export then uses
  // the existing (unchanged) data above.
  const [overtimeRows, setOvertimeRows] = useState<OvertimeReportRow[] | null>(null);

  // Task 4 (D2/D4): one report computation, from a source - Firestore
  // directly ("direct"), or the server for an Admin limited to some sites:
  // their sites only ("shifts", the on-screen report, D12) or every site
  // ("export", the downloads - needs Export payroll, D4).
  const computeReport = useCallback(
    async (
      startDate: string,
      endDate: string,
      companyFilter: CompanyFilter,
      source: "direct" | "shifts" | "export"
    ): Promise<ReportData> => {
      if (!companyId) throw new Error("No company loaded.");
      const out = { allSitesDayTotals: null } as unknown as ReportData;
        const start = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T23:59:59");

        const eventsRef = collection(db, "companies", companyId, "clockEvents");
        const q = query(
          eventsRef,
          where("timestamp", ">=", Timestamp.fromDate(start)),
          where("timestamp", "<=", Timestamp.fromDate(end)),
          orderBy("timestamp", "asc")
        );
        // Task 4 (D2/D4): a restricted admin's data comes from the server -
        // their sites only ("shifts") or every site for the export ("export").
        const serverData = source === "direct" ? null : await loadServerReportData(source, startDate, endDate, start, end);
        const inNarrowRange = (d: DocLike) => {
          const ms = (d.data().timestamp as Timestamp | undefined)?.toMillis() ?? 0;
          return ms >= start.getTime() && ms <= end.getTime();
        };
        const snapshot = serverData ? { docs: serverData.clockEvents.filter(inNarrowRange) } : await getDocs(q);
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

        const approvalsRef = collection(db, "companies", companyId, "timesheetApprovals");
        const approvalsQuery = query(
          approvalsRef,
          // Phase 10 (W8 a): from the range's start (one day early), not
          // from the cutover - lib/approvalsWindow.ts.
          where("date", ">=", approvalsQueryStart(startDate, APPROVALS_CUTOVER_DATE)),
          where("date", "<=", endDate)
        );
        const narrowApprovalsStart = approvalsQueryStart(startDate, APPROVALS_CUTOVER_DATE);
        const approvalsSnapshot = serverData
          ? { docs: serverData.approvals.filter((d) => String(d.data().date ?? "") >= narrowApprovalsStart) }
          : await getDocs(approvalsQuery);
        const approvalStatusByClockInId = new Map<string, "pending" | "approved">();
        // Auto Break settings frozen on an approved session at the moment
        // it was approved - same frozen-vs-live split the Timesheet
        // Approvals page already applies. Only populated for approved
        // docs; a pending or pre-cutover (no doc at all) session has no
        // entry here, so computePayrollAndSessions falls back to the
        // company's live settings for those, same as before this existed.
        const autoBreakByClockInId = new Map<string, { minutes: number; minShiftHours: number }>();
        // Job picked and saved on a Timesheet Approvals row, rolled up to
        // one vote per employee+day - keyed the same way as
        // hoursByEmployeeDay ("employeeId__date") so buildDayRows can look
        // it up directly. A day with more than one session can have more
        // than one approval doc; if they picked different jobs, that's
        // ambiguous at the day level so it falls back to the employee's
        // assigned job rather than guessing which session's pick wins.
        const approvedJobIdVotesByDay = new Map<string, Set<string>>();
        // Tips (Task 3): only read while the Tips toggle is ON - OFF leaves
        // every export exactly as before (saved tips are kept, D7).
        const tipCentsByClockInId = new Map<string, number>();
        const readTip = (id: string, raw: unknown) => {
          if (settings.tipsEnabled && typeof raw === "number" && raw > 0) tipCentsByClockInId.set(id, raw);
        };
        approvalsSnapshot.docs.forEach((d) => {
          const data = d.data() as {
            status?: "pending" | "approved";
            employeeId?: string;
            date?: string;
            jobId?: string | null;
            autoBreakMinutesApplied?: number;
            autoBreakMinShiftHoursApplied?: number;
            tipCents?: number;
          };
          approvalStatusByClockInId.set(d.id, data.status ?? "pending");
          readTip(d.id, data.tipCents);
          if (data.status === "approved") {
            autoBreakByClockInId.set(d.id, {
              minutes: data.autoBreakMinutesApplied ?? 0,
              minShiftHours: data.autoBreakMinShiftHoursApplied ?? 0,
            });
          }
          if (data.jobId && data.employeeId && data.date) {
            const key = `${data.employeeId}__${data.date}`;
            const votes = approvedJobIdVotesByDay.get(key) ?? new Set<string>();
            votes.add(data.jobId);
            approvedJobIdVotesByDay.set(key, votes);
          }
        });
        const approvedJobIdByEmployeeDayOut = new Map<string, string | null>();
        approvedJobIdVotesByDay.forEach((votes, key) => {
          approvedJobIdByEmployeeDayOut.set(key, votes.size === 1 ? Array.from(votes)[0] : null);
        });
        out.approvedJobIdByEmployeeDay = (approvedJobIdByEmployeeDayOut);

        const excludedEventIds = computeExcludedEventIds(events, approvalStatusByClockInId);

        const employeesRef = collection(db, "companies", companyId, "employees");
        const employeesSnapshot = await getDocs(employeesRef);
        const companyOfEmployee = new Map(employeesSnapshot.docs.map((d) => [d.id, (d.data().subcontractorId as string | null | undefined) ?? null]));
        const inCompany = (employeeId: string | null | undefined) =>
          !!employeeId && companyMatches(companyFilter, companyOfEmployee.get(employeeId) ?? null);
        const gatedEvents = events.filter((event) => !excludedEventIds.has(event.id) && inCompany(event.employeeId));
        // Task 5 (K8): kiosk records never clock in - never a report row.
        const employeeDocs = employeesSnapshot.docs.filter((d) => inCompany(d.id) && d.get("kiosk") !== true);

        // ---- Jobs (name + live hourly rate) ----
        const jobsRef = collection(db, "companies", companyId, "jobs");
        const jobsSnapshot = await getDocs(jobsRef);
        const jobsMap = new Map<string, Job>();
        jobsSnapshot.docs.forEach((d) => {
          const data = d.data() as Omit<Job, "id">;
          jobsMap.set(d.id, { id: d.id, ...data });
        });
        out.jobs = (Array.from(jobsMap.values()));

        const { employeeJobIdById: employeeJobIdByIdOut, defaultRateByEmployeeId, subcontractorByEmployeeId } =
          buildEmployeeDerivedMaps(employeeDocs, jobsMap);
        out.employeeJobIdById = (employeeJobIdByIdOut);

        const sitesRef = collection(db, "companies", companyId, "jobSites");
        const sitesSnapshot = await getDocs(sitesRef);
        let activeSites = 0;
        const siteNameByIdAll = new Map<string, string>();
        sitesSnapshot.docs.forEach((d) => {
          const data = d.data() as { name?: string; active?: boolean };
          siteNameByIdAll.set(d.id, data.name ?? "Unknown site");
          if (data.active) activeSites += 1;
        });
        out.activeJobSiteCount = (activeSites);

        out.employeeRecords = (
          buildEmployeeExportRecords(
            employeeDocs,
            jobsMap,
            siteNameByIdAll,
            defaultRateByEmployeeId
          )
        );

        // ---- Shift notes (supervisor-written, scoped to the same date range) ----
        const usersRef = collection(db, "users");
        const usersQuery = query(usersRef, where("companyId", "==", companyId));
        const usersSnapshot = await getDocs(usersQuery);
        const nameByUid = new Map<string, string>();
        usersSnapshot.docs.forEach((d) => {
          const data = d.data() as { name?: string };
          nameByUid.set(d.id, data.name ?? "Unknown");
        });

        const notesRef = collection(db, "companies", companyId, "shiftNotes");
        const notesQuery = query(
          notesRef,
          where("timestamp", ">=", Timestamp.fromDate(start)),
          where("timestamp", "<=", Timestamp.fromDate(end)),
          orderBy("timestamp", "asc")
        );
        const notesSnapshot = serverData ? { docs: serverData.shiftNotes } : await getDocs(notesQuery);
        out.shiftNotes = (
          buildShiftNotes(notesSnapshot.docs as unknown as Parameters<typeof buildShiftNotes>[0], nameByUid).filter((n) =>
            n.employeeId ? inCompany(n.employeeId) : companyFilter === ALL_COMPANIES
          )
        );

        const exitsSnapshot = serverData ? { docs: serverData.siteExits } : await getDocs(
          query(
            collection(db, "companies", companyId, "siteExits"),
            where("startMs", ">=", start.getTime()),
            where("startMs", "<=", end.getTime()),
            orderBy("startMs", "asc")
          )
        );
        out.siteExits = (
          exitsSnapshot.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<SiteExit, "id">) }))
            .filter((x) => inCompany(x.employeeId))
        );

        const payroll = computePayrollAndSessions(
          gatedEvents,
          subcontractorByEmployeeId,
          defaultRateByEmployeeId,
          settings.exportSettings.automaticBreakMinutes,
          settings.exportSettings.minimumShiftHours,
          autoBreakByClockInId,
          tipCentsByClockInId
        );
        out.summaries = (payroll.summaries);
        out.hoursByEmployeeDay = (payroll.hoursByEmployeeDay);
        out.breakHoursByEmployeeDay = (payroll.breakHoursByEmployeeDay);
        out.tipsByEmployeeDay = (payroll.tipsByEmployeeDay);
        out.sessions = (payroll.sessions);
        out.avgHoursPerEmployee = (payroll.avgHoursPerEmployee);
        out.hoursPerDay = (payroll.hoursPerDay);

        const attendanceResult = computeAttendanceAndSiteReports(
          gatedEvents,
          payroll.siteHoursTotal,
          payroll.siteCostTotal,
          subcontractorByEmployeeId,
          settings.businessHours.open,
          settings.attendanceRules.gracePeriodMinutes ?? 0,
          payroll.breakHoursByEmployeeDay
        );
        // ---- Overtime (Task 1), only with the Overtime toggle ON ----
        // Weekly OT needs the whole week, so this loads from the start of
        // the week containing startDate (company week start + time zone),
        // with a day of margin each side; rows outside startDate..endDate
        // are computed but not shown. Same approval gating and company
        // filter as everything above.
        if (settings.overtimeEnabled) {
          const otSettings = overtimeSettingsFrom(settings);
          const weekStartKey = overtimeWeekKey(startDate, otSettings.weekStartsOn);
          const wideStart = new Date(`${weekStartKey}T00:00:00`);
          wideStart.setDate(wideStart.getDate() - 1);
          const wideEnd = new Date(end);
          wideEnd.setDate(wideEnd.getDate() + 1);
          const wideSnapshot = serverData ? { docs: serverData.clockEvents } : await getDocs(
            query(
              eventsRef,
              where("timestamp", ">=", Timestamp.fromDate(wideStart)),
              where("timestamp", "<=", Timestamp.fromDate(wideEnd)),
              orderBy("timestamp", "asc")
            )
          );
          const wideEvents = wideSnapshot.docs.map((d) => {
            const data = d.data() as Omit<EventWithDate, "id">;
            return { id: d.id, ...data, timestamp: data.adjustedTimestamp ?? data.timestamp };
          });
          const wideStartKey = `${wideStart.getFullYear()}-${String(wideStart.getMonth() + 1).padStart(2, "0")}-${String(wideStart.getDate()).padStart(2, "0")}`;
          const wideApprovals = serverData ? { docs: serverData.approvals } : await getDocs(
            query(
              approvalsRef,
              where("date", ">=", approvalsQueryStart(wideStartKey < startDate ? wideStartKey : startDate, APPROVALS_CUTOVER_DATE)),
              where("date", "<=", endDate)
            )
          );
          const wideStatus = new Map<string, "pending" | "approved">();
          const wideAutoBreak = new Map<string, { minutes: number; minShiftHours: number }>();
          const jobIdByClockInId = new Map<string, string | null>();
          const frozenOvertimeMinutesByClockInId = new Map<string, number>();
          const frozenRatesByClockInId = new Map<string, { rate: number; overtimeRate: number | null }>();
          wideApprovals.docs.forEach((d) => {
            const data = d.data() as {
              status?: "pending" | "approved";
              jobId?: string | null;
              autoBreakMinutesApplied?: number;
              autoBreakMinShiftHoursApplied?: number;
              overtimeApplied?: { overtimeMinutes?: number; rate?: number | null; overtimeRate?: number | null };
              tipCents?: number;
            };
            readTip(d.id, data.tipCents);
            if (data.status === "approved" && typeof data.overtimeApplied?.overtimeMinutes === "number") {
              frozenOvertimeMinutesByClockInId.set(d.id, data.overtimeApplied.overtimeMinutes);
              // Decision 4B: rates frozen with it (docs approved before 4B
              // have none -> live rates).
              if (typeof data.overtimeApplied.rate === "number") {
                frozenRatesByClockInId.set(d.id, {
                  rate: data.overtimeApplied.rate,
                  overtimeRate: data.overtimeApplied.overtimeRate ?? null,
                });
              }
            }
            wideStatus.set(d.id, data.status ?? "pending");
            if (data.status === "approved") {
              wideAutoBreak.set(d.id, {
                minutes: data.autoBreakMinutesApplied ?? 0,
                minShiftHours: data.autoBreakMinShiftHoursApplied ?? 0,
              });
            }
            if (data.jobId) jobIdByClockInId.set(d.id, data.jobId);
          });
          // Task 4 rule 2: a restricted admin only has their sites' shifts, so
          // each shift's OT comes from the server (computed from every site).
          if (serverData) {
            for (const [id, o] of Object.entries(serverData.overtime)) {
              if (typeof o.overtimeMinutes === "number") frozenOvertimeMinutesByClockInId.set(id, o.overtimeMinutes);
            }
            const employeeOfClockIn = new Map(wideEvents.map((e) => [e.id, e.employeeId]));
            const totals = new Map<string, { workedMinutes: number; overtimeMinutes: number }>();
            for (const [id, o] of Object.entries(serverData.overtime)) {
              const emp = employeeOfClockIn.get(id);
              if (emp && o.dayKey) totals.set(`${emp}__${o.dayKey}`, { workedMinutes: o.dayWorkedMinutes ?? 0, overtimeMinutes: o.dayOvertimeMinutes ?? 0 });
            }
            out.allSitesDayTotals = totals;
          }
          const wideExcluded = computeExcludedEventIds(wideEvents, wideStatus);
          const otShifts = pairReportShifts(
            wideEvents
              .filter((e) => !wideExcluded.has(e.id) && inCompany(e.employeeId))
              .map((e) => ({ id: e.id, employeeId: e.employeeId, type: e.type, ms: e.timestamp.toMillis() }))
          );
          const otEmployees = new Map<string, ReportEmployee>();
          employeeDocs.forEach((d) => {
            const data = d.data() as {
              name?: string;
              jobId?: string | null;
              hourlyRate?: number | null;
              subcontractorId?: string | null;
              subcontractorName?: string | null;
            };
            otEmployees.set(d.id, {
              name: data.name ?? "",
              defaultJobId: data.jobId ?? null,
              customRate: data.hourlyRate ?? null,
              isSubcontractor: !!data.subcontractorId,
              subcontractorName: data.subcontractorName ?? null,
            });
          });
          out.overtimeRows = (
            buildOvertimeReportRows({
              shifts: otShifts,
              employees: otEmployees,
              jobs: jobsMap,
              jobIdByClockInId,
              autoBreakByClockInId: wideAutoBreak,
              settings: otSettings,
              roundDailyMinutes: settings.exportSettings.roundDailyMinutes,
              startDate,
              endDate,
              frozenOvertimeMinutesByClockInId,
              frozenRatesByClockInId,
              tipCentsByClockInId,
            })
          );
        }

        out.attendanceRecords = (attendanceResult.attendanceRecords);
        out.attendance = (attendanceResult.attendance);
        out.employeesPerDay = (attendanceResult.employeesPerDay);
        out.jobSiteReports = (attendanceResult.jobSiteReports);
      return out;
    },
    // settings as a whole: the Overtime branch reads several of its fields
    // (toggle, thresholds, multiplier, rounding, time zone).
    [companyId, settings, loadServerReportData]
  );

  const lastRun = useRef<{ startDate: string; endDate: string; companyFilter: CompanyFilter } | null>(null);
  const [allSitesDayTotals, setAllSitesDayTotals] = useState<ReportData["allSitesDayTotals"]>(null);

  const runReport = useCallback(
    // Phase 9 (H9 a/a): companyFilter narrows EVERY section and export to
    // one company, by the employee's current company (same as the reports
    // already show). Supervisor site notes (no employee) only show under
    // "All companies".
    async (startDate: string, endDate: string, companyFilter: CompanyFilter = ALL_COMPANIES) => {
      if (!companyId) return;
      setError("");
      setLoading(true);
      setSummaries(null);
      setOvertimeRows(null);
      try {
        const d = await computeReport(startDate, endDate, companyFilter, serverReads ? "shifts" : "direct");
        lastRun.current = { startDate, endDate, companyFilter };
        setSummaries(d.summaries);
        setHoursByEmployeeDay(d.hoursByEmployeeDay);
        setBreakHoursByEmployeeDay(d.breakHoursByEmployeeDay);
        setTipsByEmployeeDay(d.tipsByEmployeeDay);
        setSessions(d.sessions);
        setAvgHoursPerEmployee(d.avgHoursPerEmployee);
        setHoursPerDay(d.hoursPerDay);
        setJobs(d.jobs);
        setEmployeeJobIdById(d.employeeJobIdById);
        setActiveJobSiteCount(d.activeJobSiteCount);
        setEmployeeRecords(d.employeeRecords);
        setShiftNotes(d.shiftNotes);
        setSiteExits(d.siteExits);
        setApprovedJobIdByEmployeeDay(d.approvedJobIdByEmployeeDay);
        setOvertimeRows(d.overtimeRows ?? null);
        setAttendanceRecords(d.attendanceRecords);
        setAttendance(d.attendance);
        setEmployeesPerDay(d.employeesPerDay);
        setJobSiteReports(d.jobSiteReports);
        setAllSitesDayTotals(d.allSitesDayTotals ?? null);
      } catch (err) {
        console.error("Report generation error:", err);
        if (toastIfPermissionDenied(err, { action: "view this report" })) return;
        setError("Couldn't generate the report. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [companyId, computeReport, serverReads]
  );

  // Task 4 (D4/D12): what the downloads use. Everyone except a restricted
  // admin: the report on screen. A restricted admin: the same report for
  // EVERY site, fetched now (needs Export payroll - the server checks).
  const loadExportData = useCallback(async (): Promise<ReportData | null> => {
    if (!serverReads || !lastRun.current) return null;
    const { startDate, endDate, companyFilter } = lastRun.current;
    return computeReport(startDate, endDate, companyFilter, "export");
  }, [computeReport, serverReads]);

  return {
    loading,
    error,
    summaries,
    attendance,
    hoursPerDay,
    employeesPerDay,
    avgHoursPerEmployee,
    jobSiteReports,
    activeJobSiteCount,
    sessions,
    employeeRecords,
    attendanceRecords,
    shiftNotes,
    siteExits,
    jobs,
    employeeJobIdById,
    hoursByEmployeeDay,
    breakHoursByEmployeeDay,
    tipsByEmployeeDay,
    approvedJobIdByEmployeeDay,
    overtimeRows,
    allSitesDayTotals,
    runReport,
    loadExportData,
  };
}
