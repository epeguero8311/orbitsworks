import type {
  EmployeeSummary,
  SessionRecord,
  EmployeeExportRecord,
  AttendanceRecord,
  ShiftNote,
  Job,
} from "@/lib/types";
import { getExcelJS, downloadWorkbook } from "@/lib/excelHelpers";
import {
  addDetailSheet,
  addNotesSheet,
  addSummarySheet,
  addPhotosSheet,
  addEmployeesSheet,
  addAttendanceSheet,
} from "@/lib/reportExcelSheets";
import {
  buildDayRows,
  addPayrollSheet,
  addEmployeeHistorySheet,
  type EmployeeHistoryDayRow,
  type EmployeeHistoryWeek,
} from "@/lib/payrollExcelSheets";

export function slugify(value: string) {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "Company";
}

export function buildExportFilename(
  companyName: string,
  reportLabel: string,
  extension: "xlsx" | "csv",
  startDate?: string,
  endDate?: string
) {
  const company = slugify(companyName);
  const label = reportLabel.replace(/\s+/g, "");
  const range = startDate && endDate ? `_${startDate}_to_${endDate}` : "";
  return `${company}_${label}${range}.${extension}`;
}

export async function exportEmployeeHistoryExcel(
  employeeName: string,
  hourlyRate: number | null,
  defaultJobId: string | null,
  jobs: Job[],
  dayRows: EmployeeHistoryDayRow[],
  weeklyTotals: EmployeeHistoryWeek[],
  overtimeThreshold: number,
  companyName: string,
  startDate: string,
  endDate: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  addEmployeeHistorySheet(
    workbook,
    employeeName,
    hourlyRate,
    defaultJobId,
    jobs,
    dayRows,
    weeklyTotals,
    overtimeThreshold,
    startDate,
    endDate
  );

  await downloadWorkbook(
    workbook,
    buildExportFilename(
      `${companyName}_${employeeName}`,
      "TimeHistory",
      "xlsx",
      startDate,
      endDate
    )
  );
}

// ---- Standalone per-report exports, each its own file ----

export async function exportTimesheetsExcel(
  sessions: SessionRecord[],
  summaries: EmployeeSummary[],
  shiftNotes: ShiftNote[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  addSummarySheet(workbook, summaries, companyName, startDate, endDate);
  addDetailSheet(workbook, sessions, companyName, startDate, endDate);
  addNotesSheet(workbook, shiftNotes, startDate, endDate);
  await addPhotosSheet(workbook, sessions, startDate, endDate);

  await downloadWorkbook(
    workbook,
    buildExportFilename(companyName, "Timesheets", "xlsx", startDate, endDate)
  );
}

export async function exportEmployeesExcel(
  employeeRecords: EmployeeExportRecord[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  addEmployeesSheet(workbook, employeeRecords, companyName, startDate, endDate);

  await downloadWorkbook(
    workbook,
    buildExportFilename(companyName, "Employees", "xlsx", startDate, endDate)
  );
}

export async function exportPayrollExcel(
  summaries: EmployeeSummary[],
  jobs: Job[],
  hoursByEmployeeDay: Map<string, number>,
  breakHoursByEmployeeDay: Map<string, number>,
  employeeJobIdById: Map<string, string | null>,
  companyName: string,
  startDate: string,
  endDate: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  const dayRows = buildDayRows(
    summaries,
    hoursByEmployeeDay,
    breakHoursByEmployeeDay,
    employeeJobIdById,
    jobs
  );
  addPayrollSheet(workbook, summaries, jobs, dayRows, companyName, startDate, endDate);

  await downloadWorkbook(
    workbook,
    buildExportFilename(companyName, "Payroll", "xlsx", startDate, endDate)
  );
}

export async function exportAttendanceExcel(
  attendanceRecords: AttendanceRecord[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  addAttendanceSheet(workbook, attendanceRecords, companyName, startDate, endDate);

  await downloadWorkbook(
    workbook,
    buildExportFilename(companyName, "Attendance", "xlsx", startDate, endDate)
  );
}

// ---- Combined export: all reports, one workbook, in order ----

export async function exportAllReportsExcel(
  sessions: SessionRecord[],
  summaries: EmployeeSummary[],
  employeeRecords: EmployeeExportRecord[],
  attendanceRecords: AttendanceRecord[],
  shiftNotes: ShiftNote[],
  jobs: Job[],
  hoursByEmployeeDay: Map<string, number>,
  breakHoursByEmployeeDay: Map<string, number>,
  employeeJobIdById: Map<string, string | null>,
  companyName: string,
  startDate: string,
  endDate: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  addSummarySheet(workbook, summaries, companyName, startDate, endDate);
  addDetailSheet(workbook, sessions, companyName, startDate, endDate);
  addNotesSheet(workbook, shiftNotes, startDate, endDate);
  await addPhotosSheet(workbook, sessions, startDate, endDate);
  addEmployeesSheet(workbook, employeeRecords, companyName, startDate, endDate);

  const dayRows = buildDayRows(
    summaries,
    hoursByEmployeeDay,
    breakHoursByEmployeeDay,
    employeeJobIdById,
    jobs
  );
  addPayrollSheet(workbook, summaries, jobs, dayRows, companyName, startDate, endDate);

  addAttendanceSheet(workbook, attendanceRecords, companyName, startDate, endDate);

  await downloadWorkbook(
    workbook,
    buildExportFilename(companyName, "FullReport", "xlsx", startDate, endDate)
  );
}
