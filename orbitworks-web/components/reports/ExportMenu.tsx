"use client";

import type {
  EmployeeSummary,
  SessionRecord,
  EmployeeExportRecord,
  AttendanceRecord,
} from "@/lib/types";
import {
  toPayrollCsv,
  toTimesheetsCsv,
  toEmployeesCsv,
  toAttendanceCsv,
  downloadCsv,
} from "@/lib/reportUtils";

export default function ExportMenu({
  summaries,
  sessions,
  employeeRecords,
  attendanceRecords,
  startDate,
  endDate,
}: {
  summaries: EmployeeSummary[];
  sessions: SessionRecord[];
  employeeRecords: EmployeeExportRecord[];
  attendanceRecords: AttendanceRecord[];
  startDate: string;
  endDate: string;
}) {
  const buttons = [
    {
      label: "Export Timesheets (CSV)",
      onClick: () =>
        downloadCsv(
          toTimesheetsCsv(sessions, startDate, endDate),
          `orbitworks-timesheets_${startDate}_to_${endDate}.csv`
        ),
    },
    {
      label: "Export Employees (CSV)",
      onClick: () =>
        downloadCsv(toEmployeesCsv(employeeRecords), `orbitworks-employees.csv`),
    },
    {
      label: "Export Payroll Hours (CSV)",
      onClick: () =>
        downloadCsv(
          toPayrollCsv(summaries, startDate, endDate),
          `orbitworks-payroll_${startDate}_to_${endDate}.csv`
        ),
    },
    {
      label: "Export Attendance Report (CSV)",
      onClick: () =>
        downloadCsv(
          toAttendanceCsv(attendanceRecords, startDate, endDate),
          `orbitworks-attendance_${startDate}_to_${endDate}.csv`
        ),
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b) => (
        <button
          key={b.label}
          onClick={b.onClick}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-950 transition-colors hover:border-gray-300"
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
