"use client";

import { useState } from "react";
import { ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
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
import {
  buildExportFilename,
  exportTimesheetsExcel,
  exportEmployeesExcel,
  exportPayrollExcel,
  exportAttendanceExcel,
} from "@/lib/reportExcelUtils";

export function ExportDropdown({
  label,
  onExcel,
  onCsv,
}: {
  label: string;
  onExcel: () => void;
  onCsv: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-950 transition-colors hover:border-gray-300"
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-gray-600" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => {
                onExcel();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-950 hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => {
                onCsv();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2.5 text-left text-sm text-gray-950 hover:bg-gray-50"
            >
              <FileText className="h-4 w-4 text-gray-600" />
              CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ExportMenu({
  summaries,
  sessions,
  employeeRecords,
  attendanceRecords,
  startDate,
  endDate,
  companyName,
}: {
  summaries: EmployeeSummary[];
  sessions: SessionRecord[];
  employeeRecords: EmployeeExportRecord[];
  attendanceRecords: AttendanceRecord[];
  startDate: string;
  endDate: string;
  companyName: string;
}) {
  const reports = [
    {
      label: "Timesheets",
      onExcel: () =>
        exportTimesheetsExcel(sessions, summaries, companyName, startDate, endDate),
      onCsv: () =>
        downloadCsv(
          toTimesheetsCsv(sessions, startDate, endDate),
          buildExportFilename(companyName, "Timesheets", "csv", startDate, endDate)
        ),
    },
    {
      label: "Employees",
      onExcel: () => exportEmployeesExcel(employeeRecords, companyName),
      onCsv: () =>
        downloadCsv(
          toEmployeesCsv(employeeRecords),
          buildExportFilename(companyName, "Employees", "csv")
        ),
    },
    {
      label: "Payroll Hours",
      onExcel: () => exportPayrollExcel(summaries, companyName, startDate, endDate),
      onCsv: () =>
        downloadCsv(
          toPayrollCsv(summaries, startDate, endDate),
          buildExportFilename(companyName, "Payroll", "csv", startDate, endDate)
        ),
    },
    {
      label: "Attendance Report",
      onExcel: () =>
        exportAttendanceExcel(attendanceRecords, companyName, startDate, endDate),
      onCsv: () =>
        downloadCsv(
          toAttendanceCsv(attendanceRecords, startDate, endDate),
          buildExportFilename(companyName, "Attendance", "csv", startDate, endDate)
        ),
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {reports.map((r) => (
        <ExportDropdown key={r.label} label={r.label} onExcel={r.onExcel} onCsv={r.onCsv} />
      ))}
    </div>
  );
}
