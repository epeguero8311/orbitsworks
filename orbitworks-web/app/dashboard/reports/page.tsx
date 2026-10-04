"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { useReports } from "@/lib/hooks/useReports";
import { dateKey, startOfWeek } from "@/lib/reportUtils";
import { toTimesheetsCsv, downloadCsv } from "@/lib/reportUtils";
import { buildExportFilename, exportAllReportsExcel } from "@/lib/reportExcelUtils";
import { buildDailyBreakdownRows, computeEmployeeRoundedTotals } from "@/lib/reportDailyBreakdown";
import AttendanceCards from "@/components/reports/AttendanceCards";
import TimeTrendsCharts from "@/components/reports/TimeTrendsCharts";
import PayrollTable from "@/components/reports/PayrollTable";
import PayrollDayView from "@/components/reports/PayrollDayView";
import ShiftNotesTable from "@/components/reports/ShiftNotesTable";
import ExportMenu, { ExportDropdown } from "@/components/reports/ExportMenu";

const ROUNDING_LABELS: Record<number, string> = {
  0: "Off",
  5: "5 min",
  15: "15 min",
  30: "30 min",
};

export default function ReportsPage() {
  const { userData } = useAuth();
  const { settings } = useCompanySettings();
  const { roundDailyMinutes, roundTotalMinutes } = settings.exportSettings;
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

  // Report-time-only job overrides used by the in-app Daily breakdown view,
  // keyed "employeeId__yyyy-mm-dd" -> jobId. Never touches clock sessions.
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const {
    loading,
    error,
    summaries,
    attendance,
    hoursPerWeek,
    employeesPerDay,
    avgHoursPerEmployee,
    sessions,
    employeeRecords,
    attendanceRecords,
    shiftNotes,
    jobs,
    hoursByEmployeeDay,
    breakHoursByEmployeeDay,
    employeeJobIdById,
    runReport,
  } = useReports();

  function handleRunReport(start: string, end: string) {
    setOverrides({});
    runReport(start, end);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    handleRunReport(startDate, endDate);
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
            roundDailyMinutes
          )
        : [],
    [summaries, hoursByEmployeeDay, breakHoursByEmployeeDay, jobs, overrides, roundDailyMinutes]
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
        {summaries && (
          <ExportDropdown
            label="Export"
            onExcel={() =>
              exportAllReportsExcel(
                sessions,
                summaries,
                employeeRecords,
                attendanceRecords,
                shiftNotes,
                jobs,
                hoursByEmployeeDay,
                breakHoursByEmployeeDay,
                employeeJobIdById,
                roundDailyMinutes,
                roundTotalMinutes,
                companyName,
                startDate,
                endDate
              )
            }
            onCsv={() =>
              downloadCsv(
                toTimesheetsCsv(sessions, startDate, endDate),
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
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {summaries && (
        <div className="mt-6 space-y-8">
          <ExportMenu
            summaries={summaries}
            sessions={sessions}
            employeeRecords={employeeRecords}
            attendanceRecords={attendanceRecords}
            shiftNotes={shiftNotes}
            jobs={jobs}
            hoursByEmployeeDay={hoursByEmployeeDay}
            breakHoursByEmployeeDay={breakHoursByEmployeeDay}
            employeeJobIdById={employeeJobIdById}
            overrides={overrides}
            roundDailyMinutes={roundDailyMinutes}
            roundTotalMinutes={roundTotalMinutes}
            startDate={startDate}
            endDate={endDate}
            companyName={companyName}
          />
          <AttendanceCards attendance={attendance} />
          <TimeTrendsCharts
            hoursPerWeek={hoursPerWeek}
            employeesPerDay={employeesPerDay}
            avgHoursPerEmployee={avgHoursPerEmployee}
          />
          <PayrollTable
            summaries={summaries}
            startDate={startDate}
            endDate={endDate}
            roundedTotalsByEmployee={roundedTotalsByEmployee}
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
          />
          <ShiftNotesTable notes={shiftNotes} />
        </div>
      )}
    </div>
  );
}
