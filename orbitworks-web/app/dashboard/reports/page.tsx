"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useReports } from "@/lib/hooks/useReports";
import { dateKey, startOfWeek } from "@/lib/reportUtils";
import { toTimesheetsCsv, downloadCsv } from "@/lib/reportUtils";
import { buildExportFilename, exportAllReportsExcel } from "@/lib/reportExcelUtils";
import AttendanceCards from "@/components/reports/AttendanceCards";
import TimeTrendsCharts from "@/components/reports/TimeTrendsCharts";
import PayrollTable from "@/components/reports/PayrollTable";
import PayrollDayView from "@/components/reports/PayrollDayView";
import ShiftNotesTable from "@/components/reports/ShiftNotesTable";
import ExportMenu, { ExportDropdown } from "@/components/reports/ExportMenu";

export default function ReportsPage() {
  const { userData } = useAuth();
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

  const effectiveSummaries = useMemo(() => {
    if (!summaries) return null;
    return summaries.map((s) => {
      let totalPay = 0;
      let anyRate = false;

      for (const [key, hrs] of hoursByEmployeeDay) {
        if (!key.startsWith(`${s.employeeId}__`)) continue;
        const overrideJobId = overrides[key];
        const rate = overrideJobId
          ? jobs.find((j) => j.id === overrideJobId)?.hourlyRate ?? null
          : s.hourlyRate;
        if (rate != null) {
          totalPay += hrs * rate;
          anyRate = true;
        }
      }

      return {
        ...s,
        estimatedPay: anyRate ? totalPay : s.estimatedPay,
      };
    });
  }, [summaries, hoursByEmployeeDay, overrides, jobs]);

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

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end">
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
        <button
          onClick={() => handleRunReport(startDate, endDate)}
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {loading ? "Calculating..." : "Refresh"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {summaries && effectiveSummaries && (
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
          <PayrollTable summaries={effectiveSummaries} startDate={startDate} endDate={endDate} />
          <PayrollDayView
            startDate={startDate}
            endDate={endDate}
            summaries={summaries}
            jobs={jobs}
            hoursByEmployeeDay={hoursByEmployeeDay}
            overrides={overrides}
            onOverrideChange={handleOverrideChange}
          />
          <ShiftNotesTable notes={shiftNotes} />
        </div>
      )}
    </div>
  );
}