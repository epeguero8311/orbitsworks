"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { useReports, type ReportData } from "@/lib/hooks/useReports";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useSubcontractors } from "@/lib/hooks/useSubcontractors";
import { ALL_COMPANIES, type CompanyFilter } from "@/lib/reportCompanyFilter";
import { dateKey, startOfWeek } from "@/lib/reportUtils";
import { toTimesheetsCsv, downloadCsv } from "@/lib/reportUtils";
import { buildExportFilename, exportAllReportsExcel } from "@/lib/reportExcelUtils";
import { buildDailyBreakdownRows, computeEmployeeRoundedTotals } from "@/lib/reportDailyBreakdown";
import { applyOvertimeOverrides, computeOvertimeTotals } from "@/lib/reportOvertime";
import AttendanceCards from "@/components/reports/AttendanceCards";
import TimeTrendsCharts from "@/components/reports/TimeTrendsCharts";
import PayrollTable from "@/components/reports/PayrollTable";
import PayrollDayView from "@/components/reports/PayrollDayView";
import ShiftNotesTable from "@/components/reports/ShiftNotesTable";
import ExportMenu, { ExportDropdown } from "@/components/reports/ExportMenu";
import CompanyFilterSelect from "@/components/reports/CompanyFilterSelect";
import SiteExitsReportTable from "@/components/reports/SiteExitsReportTable";

const ROUNDING_LABELS: Record<number, string> = {
  0: "Off",
  5: "5 min",
  15: "15 min",
  30: "30 min",
};

// The Reports page (app/dashboard/reports/page.tsx renders only this, to
// keep page.tsx small). Phase 9: one company filter for every section and
// export (H9 a/a) and the "Job site exits" table + Excel data (H7 a).
export default function ReportsPageView() {
  const { userData } = useAuth();
  const { settings } = useCompanySettings();
  const { roundDailyMinutes, roundTotalMinutes, automaticBreakMinutes, minimumShiftHours } =
    settings.exportSettings;
  const [companyName, setCompanyName] = useState("OrbitWorks");

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      if (snapshot.exists() && snapshot.data().name) {
        setCompanyName(snapshot.data().name);
      }
    });
    return unsubscribe;
  }, [userData?.companyId]);

  const today = dateKey(new Date());
  const weekStart = dateKey(startOfWeek(new Date()));

  const [startDate, setStartDate] = useState(weekStart);
  const [endDate, setEndDate] = useState(today);

  // Report-time-only job overrides, keyed "employeeId__yyyy-mm-dd" -> jobId.
  // Never touches clock sessions.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const { subcontractors } = useSubcontractors();
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>(ALL_COMPANIES);

  const {
    loading,
    error,
    summaries,
    attendance,
    hoursPerDay,
    employeesPerDay,
    avgHoursPerEmployee,
    sessions,
    employeeRecords,
    attendanceRecords,
    shiftNotes,
    siteExits,
    jobs,
    hoursByEmployeeDay,
    breakHoursByEmployeeDay,
    tipsByEmployeeDay,
    employeeJobIdById,
    approvedJobIdByEmployeeDay,
    overtimeRows,
    allSitesDayTotals,
    runReport,
    loadExportData,
  } = useReports();
  // Task 4: downloads need Export payroll (D4). A restricted admin's screen
  // shows only their sites (D12) while the downloads show EVERY site, so
  // their export data set is loaded from the server after each run.
  const { can, serverReads } = useAdminAccess();
  const canExport = can("exportPayroll");
  const [serverExport, setServerExport] = useState<{ forSummaries: unknown; data: ReportData } | null>(null);
  useEffect(() => {
    if (!serverReads || !canExport || !summaries) return;
    let cancelled = false;
    loadExportData()
      .then((data) => {
        if (!cancelled && data) setServerExport({ forSummaries: summaries, data });
      })
      .catch((err) => console.error("Export data load error:", err));
    return () => {
      cancelled = true;
    };
  }, [serverReads, canExport, summaries, loadExportData]);
  const exportReady = canExport && (!serverReads || serverExport?.forSummaries === summaries);
  // What the downloads use: the all-sites set (restricted) or the screen's.
  const ex: Omit<ReportData, "allSitesDayTotals"> =
    serverReads && serverExport
      ? serverExport.data
      : {
          summaries: summaries ?? [],
          attendance,
          hoursPerDay,
          employeesPerDay,
          avgHoursPerEmployee,
          jobSiteReports: [],
          activeJobSiteCount: 0,
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
        };
  // Tips (Task 3): Tips columns everywhere only while the toggle is ON
  // (OFF = useReports reads no tips, so every number is as before).
  const tipsEnabled = settings.tipsEnabled;

  // Overtime (Task 1): only non-null with the Overtime toggle ON. Every
  // section and export below falls back to today's data when it's null.
  const overtimeMultiplier = settings.overtimeMultiplier;
  // The downloads' overtime view (same overrides) - from `ex`.
  const exportOvertimeView = useMemo(() => {
    if (!ex.overtimeRows) return null;
    const rows = applyOvertimeOverrides(ex.overtimeRows, overrides, ex.jobs, settings.overtimeMultiplier);
    return {
      baseRows: ex.overtimeRows,
      rows,
      totals: computeOvertimeTotals(rows, roundTotalMinutes),
      multiplier: settings.overtimeMultiplier,
    };
  }, [ex.overtimeRows, ex.jobs, overrides, settings.overtimeMultiplier, roundTotalMinutes]);

  const overtimeView = useMemo(() => {
    if (!overtimeRows) return null;
    const rows = applyOvertimeOverrides(overtimeRows, overrides, jobs, overtimeMultiplier);
    return {
      baseRows: overtimeRows,
      rows,
      totals: computeOvertimeTotals(rows, roundTotalMinutes),
      multiplier: overtimeMultiplier,
    };
  }, [overtimeRows, overrides, jobs, overtimeMultiplier, roundTotalMinutes]);

  function handleRunReport(start: string, end: string, filter: CompanyFilter = companyFilter) {
    setOverrides({});
    runReport(start, end, filter);
  }

  function handleCompanyChange(filter: CompanyFilter) {
    setCompanyFilter(filter);
    handleRunReport(startDate, endDate, filter);
  }

  // First run when the page opens (overrides start empty, so nothing to
  // reset here). Later runs go through handleRunReport.
  useEffect(() => {
    runReport(startDate, endDate, ALL_COMPANIES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOverrideChange(employeeId: string, date: string, jobId: string) {
    const key = `${employeeId}__${date}`;
    setOverrides((prev) => {
      if (!jobId) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: jobId };
    });
  }

  // Single source for every rounded/break-aware number on this page - the
  // Daily Breakdown table, the Payroll summary's Est. pay, and the Payroll
  // CSV export all read from this same pair of values, so none of them can
  // drift apart from each other.
  const dailyRows = useMemo(
    () =>
      summaries
        ? buildDailyBreakdownRows(
            summaries,
            hoursByEmployeeDay,
            breakHoursByEmployeeDay,
            jobs,
            overrides,
            roundDailyMinutes,
            tipsByEmployeeDay
          )
        : [],
    [summaries, hoursByEmployeeDay, breakHoursByEmployeeDay, jobs, overrides, roundDailyMinutes, tipsByEmployeeDay]
  );
  const roundedTotalsByEmployee = useMemo(
    () => computeEmployeeRoundedTotals(dailyRows, roundTotalMinutes),
    [dailyRows, roundTotalMinutes]
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-950">Reports</h1>
          <p className="mt-1 text-sm text-gray-600">
            Attendance, time trends, and payroll.
          </p>
        </div>
        {summaries && exportReady && (
          <ExportDropdown
            label="Export"
            onExcel={() =>
              exportAllReportsExcel(
                ex.sessions,
                ex.summaries,
                ex.employeeRecords,
                ex.attendanceRecords,
                ex.shiftNotes,
                ex.jobs,
                ex.hoursByEmployeeDay,
                ex.breakHoursByEmployeeDay,
                ex.employeeJobIdById,
                ex.approvedJobIdByEmployeeDay,
                roundDailyMinutes,
                roundTotalMinutes,
                companyName,
                startDate,
                endDate,
                ex.siteExits,
                exportOvertimeView ? { rows: exportOvertimeView.baseRows, multiplier: exportOvertimeView.multiplier } : null,
                tipsEnabled ? { byEmployeeDay: ex.tipsByEmployeeDay } : null
              )
            }
            onCsv={() =>
              downloadCsv(
                toTimesheetsCsv(ex.sessions, startDate, endDate),
                buildExportFilename(companyName, "Timesheets", "csv", startDate, endDate)
              )
            }
          />
        )}
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <p className="mb-3 text-xs text-gray-500">
          Only approved hours will show on the export. Sessions still pending approval on
          Timesheet Approvals are left out of totals until they&apos;re approved.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label htmlFor="startDate" className="mb-1.5 block text-sm font-medium text-gray-950">
                Start date
              </label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label htmlFor="endDate" className="mb-1.5 block text-sm font-medium text-gray-950">
                End date
              </label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <CompanyFilterSelect value={companyFilter} onChange={handleCompanyChange} subcontractors={subcontractors} mainCompanyName={companyName} />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/settings"
              className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              Daily rounding: {ROUNDING_LABELS[roundDailyMinutes]}
            </Link>
            <Link
              href="/dashboard/settings"
              className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              Total rounding: {ROUNDING_LABELS[roundTotalMinutes]}
            </Link>
            <Link
              href="/dashboard/settings"
              className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              Auto break: {automaticBreakMinutes > 0 ? `${automaticBreakMinutes} min` : "Off"}
            </Link>
            <Link
              href="/dashboard/settings"
              className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              Min shift: {minimumShiftHours > 0 ? `${minimumShiftHours}h` : "None"}
            </Link>
            <button
              onClick={() => handleRunReport(startDate, endDate)}
              disabled={loading}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {loading ? "Calculating..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-600">
        Unapproved time entries won&apos;t appear in these reports or exports.{" "}
        <Link href="/dashboard/timesheet-approvals" className="font-medium text-accent hover:underline">
          Approve hours
        </Link>{" "}
        to include them.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {summaries && (
        <div className="mt-6 space-y-8">
          {exportReady && (
            <ExportMenu
              summaries={ex.summaries}
              sessions={ex.sessions}
              employeeRecords={ex.employeeRecords}
              attendanceRecords={ex.attendanceRecords}
              shiftNotes={ex.shiftNotes}
              jobs={ex.jobs}
              hoursByEmployeeDay={ex.hoursByEmployeeDay}
              breakHoursByEmployeeDay={ex.breakHoursByEmployeeDay}
              employeeJobIdById={ex.employeeJobIdById}
              approvedJobIdByEmployeeDay={ex.approvedJobIdByEmployeeDay}
              overrides={overrides}
              roundDailyMinutes={roundDailyMinutes}
              roundTotalMinutes={roundTotalMinutes}
              startDate={startDate}
              endDate={endDate}
              companyName={companyName}
              siteExits={ex.siteExits}
              overtime={exportOvertimeView}
              tipsByEmployeeDay={ex.tipsByEmployeeDay}
              tipsEnabled={tipsEnabled}
            />
          )}
          {serverReads && (
            <p className="text-xs text-gray-600">
              This report shows the job sites you have access to. Day totals and overtime count every site.
              {canExport && " Downloads include every site."}
            </p>
          )}
          <AttendanceCards attendance={attendance} />
          <TimeTrendsCharts
            hoursPerDay={hoursPerDay}
            employeesPerDay={employeesPerDay}
            avgHoursPerEmployee={avgHoursPerEmployee}
          />
          <PayrollTable
            summaries={summaries}
            startDate={startDate}
            endDate={endDate}
            roundedTotalsByEmployee={roundedTotalsByEmployee}
            overtimeTotals={overtimeView?.totals ?? null}
            tipsEnabled={tipsEnabled}
          />
          <PayrollDayView
            startDate={startDate}
            endDate={endDate}
            summaries={summaries}
            jobs={jobs}
            hoursByEmployeeDay={hoursByEmployeeDay}
            breakHoursByEmployeeDay={breakHoursByEmployeeDay}
            roundDailyMinutes={roundDailyMinutes}
            overrides={overrides}
            onOverrideChange={handleOverrideChange}
            overtimeRows={overtimeView?.rows ?? null}
            tipsByEmployeeDay={tipsByEmployeeDay}
            tipsEnabled={tipsEnabled}
            allSitesDayTotals={allSitesDayTotals}
          />
          <ShiftNotesTable notes={shiftNotes} />
          <SiteExitsReportTable exits={siteExits} />
        </div>
      )}
    </div>
  );
}
