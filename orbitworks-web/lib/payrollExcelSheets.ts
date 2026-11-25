import type { EmployeeSummary, Job, RoundingIncrement } from "@/lib/types";
import {
  parseDateKey,
  formatDatePart,
  formatDateRangeLabel,
  companyLabelFor,
  sortByCompanyThen,
  addTitleRow,
  styleHeaderRow,
  styleDataRows,
} from "@/lib/excelHelpers";
import { ceilTo, computeDailyPaidMinutes, hoursToMinutes } from "@/lib/utils/rounding";
import type { OvertimeReportRow } from "@/lib/reportOvertime";
import type { Workbook, Row, Cell } from "exceljs";
import { HOURS_COLUMNS, MIXED_RATE_LABEL, addHoursHeaderNotes } from "@/lib/hoursColumns";
import { markIgnoredFormulaErrors } from "@/lib/xlsxIgnoredErrors";

// ---- Payroll: hidden Jobs lookup sheet + day-row flattening ----

export function addJobsLookupSheet(workbook: any, jobs: Job[]): { count: number } | null {
  const activeJobs = jobs.filter((j) => j.active);
  if (activeJobs.length === 0) return null;

  const sheet = workbook.addWorksheet("Jobs");
  sheet.state = "veryHidden";

  sheet.getCell(1, 1).value = "(Default)";
  sheet.getCell(1, 2).value = null;

  activeJobs.forEach((j, idx) => {
    const r = idx + 2;
    sheet.getCell(r, 1).value = j.name;
    sheet.getCell(r, 2).value = j.hourlyRate;
  });

  const count = activeJobs.length + 1;
  workbook.definedNames.add(`'Jobs'!$A$1:$A$${count}`, "JobsList");
  workbook.definedNames.add(`'Jobs'!$A$1:$B$${count}`, "JobsTable");

  return { count };
}

export type PayrollDayRow = {
  employeeName: string;
  dateKey: string;
  dateLabel: string;
  hours: number;
  breakHours: number;
  workedHours: number;
  defaultRate: number | null;
  defaultJobName: string | null;
  subcontractorName: string | null;
};

export function buildDayRows(
  summaries: EmployeeSummary[],
  hoursByEmployeeDay: Map<string, number>,
  breakHoursByEmployeeDay: Map<string, number>,
  employeeJobIdById: Map<string, string | null>,
  jobs: Job[],
  roundDailyMinutes: RoundingIncrement,
  // Job picked and saved on the matching Timesheet Approvals row for that
  // employee+day, keyed the same way as hoursByEmployeeDay. Takes priority
  // over the employee's generally-assigned job - this is how a job picked
  // at approval time actually changes the rate shown in this sheet.
  approvedJobIdByEmployeeDay: Map<string, string | null> = new Map()
): PayrollDayRow[] {
  const nameById = new Map(summaries.map((s) => [s.employeeId, s.employeeName]));
  const rateById = new Map(summaries.map((s) => [s.employeeId, s.hourlyRate]));
  const companyById = new Map(summaries.map((s) => [s.employeeId, s.subcontractorName ?? null]));
  const jobNameById = new Map(jobs.map((j) => [j.id, j.name]));

  const rows: PayrollDayRow[] = [];
  for (const [key, hours] of hoursByEmployeeDay) {
    if (hours <= 0) continue;
    const sep = key.indexOf("__");
    if (sep === -1) continue;
    const employeeId = key.slice(0, sep);
    const dateStr = key.slice(sep + 2);
    const employeeName = nameById.get(employeeId);
    if (!employeeName) continue;

    const parsed = parseDateKey(dateStr);
    const dateLabel = parsed ? formatDatePart(parsed) : dateStr;

    const jobId = approvedJobIdByEmployeeDay.get(key) ?? employeeJobIdById.get(employeeId) ?? null;
    const defaultJobName = jobId ? jobNameById.get(jobId) ?? null : null;

    const breakHours = breakHoursByEmployeeDay.get(key) ?? 0;
    const workedMinutes = computeDailyPaidMinutes(
      hoursToMinutes(hours),
      hoursToMinutes(breakHours),
      roundDailyMinutes
    );

    rows.push({
      employeeName,
      dateKey: dateStr,
      dateLabel,
      hours,
      breakHours,
      workedHours: workedMinutes / 60,
      defaultRate: rateById.get(employeeId) ?? null,
      defaultJobName,
      subcontractorName: companyById.get(employeeId) ?? null,
    });
  }

  // dateKey is the raw YYYY-MM-DD key, so it sorts chronologically as a
  // plain string - dateLabel ("Jan 5, 2026") does not: string comparison
  // puts "Jan 12" before "Jan 5" and orders months alphabetically instead
  // of calendar order.
  rows.sort((a, b) =>
    a.employeeName === b.employeeName
      ? (a.dateKey < b.dateKey ? -1 : 1)
      : a.employeeName.localeCompare(b.employeeName)
  );
  return rows;
}

// Column layout (shared by both the summary block and the daily breakdown
// block, since they occupy the same worksheet):
// (Hours columns renamed Nov 25 - same positions and numbers.)
// A Employee            | A Employee
// B Shift Hours         | B Date
// C Break               | C Job
// D Total Worked        | D Hourly Rate
// E Sessions            | E Shift Hours
// F Open Sessions       | F Break
// G Hourly Rate         | G Total Worked
// H Estimated Pay       | H Estimated Pay
// I Company             | I Company
//                       | J (hidden) Default Rate - daily block only
//
// Break (C), Total Worked (D), and Estimated Pay (H) in the
// summary block are all formulas pulling from the daily rows below, keyed
// on employee name - this is what makes them update live if someone edits
// Break or the Job dropdown directly in Excel. Total Hours (B) stays a
// plain number since gross clocked hours aren't meant to be hand-edited the
// way Break is. Total Worked (daily G and summary D)
// are where the Settings > Export Settings rounding gets applied - both are
// baked in as plain numbers at export time (same as Hours/Break already
// were), since the rounding increment itself isn't something Excel
// recalculates live.
export function addPayrollSheet(
  workbook: any,
  summaries: EmployeeSummary[],
  jobs: Job[],
  dayRows: PayrollDayRow[],
  roundTotalMinutes: RoundingIncrement,
  companyName: string,
  startDate: string,
  endDate: string
) {
  const sheet = workbook.addWorksheet("Payroll Hours");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  sheet.columns = [
    { width: 24 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 34 }, // H Estimated Pay (Excluding Break) - full header shows
    { width: 22 },
    { width: 12 },
  ];

  addTitleRow(sheet, `Payroll Hours: ${rangeLabel}`, 9);

  const jobsInfo = addJobsLookupSheet(workbook, jobs);
  const hasJobs = jobsInfo != null;

  const sortedSummaries = sortByCompanyThen(
    summaries,
    (s) => companyLabelFor(s.subcontractorName, companyName),
    companyName,
    (a, b) => a.employeeName.localeCompare(b.employeeName)
  );

  const summaryHeaderRowNum = 2;
  const summaryHeader = sheet.getRow(summaryHeaderRowNum);
  [
    "Employee",
    // Hours column names (Nov 25): same numbers, new labels.
    HOURS_COLUMNS.shift.label,
    HOURS_COLUMNS.break.label,
    HOURS_COLUMNS.worked.label,
    "Sessions",
    "Open Sessions",
    "Hourly Rate",
    "Estimated Pay (Excluding Break)",
    "Company",
  ].forEach((h, i) => (summaryHeader.getCell(i + 1).value = h));
  styleHeaderRow(summaryHeader);
  addHoursHeaderNotes(summaryHeader, { shift: 2, break: 3, worked: 4 });

  const summaryFirstDataRow = summaryHeaderRowNum + 1;
  sortedSummaries.forEach((s, idx) => {
    const rowNum = summaryFirstDataRow + idx;
    const row = sheet.getRow(rowNum);
    row.height = 20;
    row.getCell(1).value = s.employeeName;
    row.getCell(2).value = Number(s.totalHours.toFixed(2));
    row.getCell(2).numFmt = "0.00";
    row.getCell(3).numFmt = "0.00";
    row.getCell(4).numFmt = "0.00";
    row.getCell(5).value = s.sessionCount;
    row.getCell(6).value = s.openSessions;
    row.getCell(7).value = s.hourlyRate;
    row.getCell(7).numFmt = '"$"#,##0.00';
    row.getCell(8).numFmt = '"$"#,##0.00';
    row.getCell(9).value = companyLabelFor(s.subcontractorName, companyName);
  });

  const summaryLastRow = summaryFirstDataRow + sortedSummaries.length - 1;

  const dailyTitleRow = summaryLastRow + 3;
  sheet.mergeCells(dailyTitleRow, 1, dailyTitleRow, 9);
  const titleCell = sheet.getCell(dailyTitleRow, 1);
  titleCell.value = hasJobs
    ? "Daily Breakdown - pick a Job on any row to update that day's pay and the totals above"
    : "Daily Breakdown";
  titleCell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
  sheet.getRow(dailyTitleRow).height = 26;

  const dailyHeaderRow = dailyTitleRow + 1;
  const dailyHeader = sheet.getRow(dailyHeaderRow);
  [
    "Employee",
    "Date",
    "Job",
    "Hourly Rate",
    HOURS_COLUMNS.shift.label,
    HOURS_COLUMNS.break.label,
    HOURS_COLUMNS.worked.label,
    "Estimated Pay (Excluding Break)",
    "Company",
  ].forEach((h, i) => (dailyHeader.getCell(i + 1).value = h));
  dailyHeader.getCell(10).value = "Default Rate";
  styleHeaderRow(dailyHeader);
  addHoursHeaderNotes(dailyHeader, { shift: 5, break: 6, worked: 7 });
  sheet.getColumn(10).hidden = true;

  const sortedDayRows = sortByCompanyThen(
    dayRows,
    (d) => companyLabelFor(d.subcontractorName, companyName),
    companyName,
    (a, b) =>
      a.employeeName === b.employeeName
        ? a.dateKey < b.dateKey
          ? -1
          : 1
        : a.employeeName.localeCompare(b.employeeName)
  );

  let r = dailyHeaderRow + 1;
  let prevEmployee: string | null = null;

  sortedDayRows.forEach((d) => {
    if (prevEmployee !== null && d.employeeName !== prevEmployee) {
      sheet.getRow(r).height = 10;
      r += 1;
    }
    prevEmployee = d.employeeName;

    const row = sheet.getRow(r);
    row.height = 20;
    row.getCell(1).value = d.employeeName;
    row.getCell(2).value = d.dateLabel;
    row.getCell(3).value = hasJobs ? d.defaultJobName ?? "(Default)" : null;
    row.getCell(10).value = d.defaultRate;

    if (hasJobs) {
      row.getCell(4).value = {
        formula: `IF(OR(C${r}="",C${r}="(Default)"),J${r},VLOOKUP(C${r},JobsTable,2,FALSE))`,
      };
      row.getCell(3).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ["JobsList"],
      };
    } else {
      row.getCell(4).value = { formula: `J${r}` };
    }
    row.getCell(4).numFmt = '"$"#,##0.00';

    row.getCell(5).value = Number(d.hours.toFixed(2));
    row.getCell(5).numFmt = "0.00";

    row.getCell(6).value = Number(d.breakHours.toFixed(2));
    row.getCell(6).numFmt = "0.00";

    // Total Worked = shift hours - unpaid break hours, rounded per the
    // "Round daily worked hours" Export Setting (baked in at export time).
    row.getCell(7).value = Number(d.workedHours.toFixed(2));
    row.getCell(7).numFmt = "0.00";

    // Est. Pay = rate x Total Worked (not raw hours - break), so it already
    // reflects daily rounding.
    row.getCell(8).value = { formula: `D${r}*G${r}` };
    row.getCell(8).numFmt = '"$"#,##0.00';

    row.getCell(9).value = companyLabelFor(d.subcontractorName, companyName);

    r += 1;
  });

  const dailyFirstDataRow = dailyHeaderRow + 1;
  const dailyLastRow = r - 1;

  sortedSummaries.forEach((s, idx) => {
    const row = summaryFirstDataRow + idx;
    if (sortedDayRows.length > 0) {
      sheet.getCell(row, 3).value = {
        formula: `SUMIF(A${dailyFirstDataRow}:A${dailyLastRow},A${row},F${dailyFirstDataRow}:F${dailyLastRow})`,
      };
      sheet.getCell(row, 4).value =
        roundTotalMinutes === 0
          ? {
              formula: `SUMIF(A${dailyFirstDataRow}:A${dailyLastRow},A${row},G${dailyFirstDataRow}:G${dailyLastRow})`,
            }
          : {
              formula: `CEILING(SUMIF(A${dailyFirstDataRow}:A${dailyLastRow},A${row},G${dailyFirstDataRow}:G${dailyLastRow}),${roundTotalMinutes / 60})`,
            };
      sheet.getCell(row, 8).value = {
        formula: `SUMIF(A${dailyFirstDataRow}:A${dailyLastRow},A${row},H${dailyFirstDataRow}:H${dailyLastRow})`,
      };
    } else {
      const totalWorkedMinutes = ceilTo(
        Math.max(0, hoursToMinutes(s.totalHours) - hoursToMinutes(s.totalBreakHours)),
        roundTotalMinutes
      );
      sheet.getCell(row, 3).value = s.totalBreakHours;
      sheet.getCell(row, 4).value = Number((totalWorkedMinutes / 60).toFixed(2));
      sheet.getCell(row, 8).value = s.estimatedPay;
    }
  });

  styleDataRows(sheet, 2);
  sheet.views = [{ state: "frozen", ySplit: 2 }];
}

// ---- Employee history: single-employee daily breakdown + weekly OT summary ----
//
// Same live-formula pattern as Payroll Hours (Job dropdown -> VLOOKUP rate ->
// Estimated Pay), but scoped to one employee, plus Job Site/Notes/Adjusted
// columns and a weekly Regular/Overtime split. Overtime pay assumes a
// standard 1.5x multiplier - there's no OT-rate setting elsewhere in the
// app yet, so this is a starting assumption to confirm, not a stored rule.
const OVERTIME_MULTIPLIER = 1.5;

export type EmployeeHistoryDayRow = {
  dateLabel: string;
  weekLabel: string;
  siteName: string;
  clockInLabel: string;
  clockOutLabel: string;
  hours: number;
  breakHours: number;
  note: string;
  adjusted: boolean;
};

export type EmployeeHistoryWeek = {
  weekLabel: string;
  hours: number;
};

export function addEmployeeHistorySheet(
  workbook: any,
  employeeName: string,
  hourlyRate: number | null,
  defaultJobId: string | null,
  jobs: Job[],
  dayRows: EmployeeHistoryDayRow[],
  weeklyTotals: EmployeeHistoryWeek[],
  overtimeThreshold: number,
  startDate: string,
  endDate: string
) {
  const sheet = workbook.addWorksheet("Time History");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  // Columns are shared by the weekly summary and daily breakdown blocks.
  // Header rows wrap (see wrapHeaderRow below), so a long header like
  // "Estimated Pay (Excluding Break)" splits over two lines instead of
  // forcing a very wide column. Columns whose content varies (Job Site,
  // Job, Notes) are sized to their longest value, within limits.
  const longest = (values: (string | null | undefined)[]) =>
    values.reduce((max, v) => Math.max(max, (v ?? "").length), 0);
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const siteWidth = clamp(longest(dayRows.map((d) => d.siteName)) + 2, 16, 40);
  // +4 leaves room for the Job dropdown arrow.
  const jobWidth = clamp(longest([...jobs.map((j) => j.name), "(Default)"]) + 4, 16, 32);
  const notesWidth = clamp(longest(dayRows.map((d) => d.note)) + 2, 30, 50);

  sheet.columns = [
    { width: 14 }, // A Date / Week Of
    { width: siteWidth }, // B Job Site / Hours
    { width: jobWidth }, // C Job / Total Worked
    { width: 15 }, // D Hourly Rate / Overtime
    { width: 19 }, // E Clock In / Estimated Pay (Excluding Break)
    { width: 12 }, // F Clock Out
    { width: 9 },  // G Hours
    { width: 9 },  // H Break
    { width: 15 }, // I Total Worked
    { width: 19 }, // J Estimated Pay (Excluding Break)
    { width: notesWidth }, // K Notes
    { width: 11 }, // L Adjusted
    { width: 12 }, // M Default Rate (hidden)
    { width: 14 }, // N Week Of (hidden)
  ];

  const wrapHeaderRow = (row: any) => {
    row.eachCell((cell: any) => {
      cell.alignment = { ...cell.alignment, wrapText: true };
    });
    row.height = 32; // two lines
  };

  addTitleRow(sheet, `${employeeName} - Time History: ${rangeLabel}`, 12);

  const jobsInfo = addJobsLookupSheet(workbook, jobs);
  const hasJobs = jobsInfo != null;

  // ---- Weekly summary block ----
  // B (Shift Hours) is the gross shift total for the week; C (Total Worked)
  // is B minus break, unclamped. Overtime (D) and Estimated Pay (E) key
  // off C, not B - overtime and its pay premium are measured against
  // worked hours, never against hours that include break time.
  const summaryHeaderRowNum = 2;
  const summaryHeader = sheet.getRow(summaryHeaderRowNum);
  ["Week Of", HOURS_COLUMNS.shift.label, HOURS_COLUMNS.worked.label, HOURS_COLUMNS.overtime.label, "Estimated Pay (Excluding Break)"].forEach(
    (h, i) => (summaryHeader.getCell(i + 1).value = h)
  );
  styleHeaderRow(summaryHeader);
  wrapHeaderRow(summaryHeader);
  addHoursHeaderNotes(summaryHeader, { shift: 2, worked: 3, overtime: 4 });

  const summaryFirstRow = summaryHeaderRowNum + 1;
  const dailyHeaderRowNum = summaryFirstRow + weeklyTotals.length + 2;
  const dailyFirstDataRow = dailyHeaderRowNum + 1;
  const dailyLastRow = dailyFirstDataRow + dayRows.length - 1;

  weeklyTotals.forEach((w, idx) => {
    const rowNum = summaryFirstRow + idx;
    const row = sheet.getRow(rowNum);
    row.height = 20;
    row.getCell(1).value = w.weekLabel;
    if (dayRows.length > 0) {
      row.getCell(2).value = {
        formula: `SUMIF(N${dailyFirstDataRow}:N${dailyLastRow},A${rowNum},G${dailyFirstDataRow}:G${dailyLastRow})`,
      };
      row.getCell(3).value = {
        formula: `SUMIF(N${dailyFirstDataRow}:N${dailyLastRow},A${rowNum},I${dailyFirstDataRow}:I${dailyLastRow})`,
      };
    } else {
      row.getCell(2).value = w.hours;
      row.getCell(3).value = w.hours;
    }
    row.getCell(2).numFmt = "0.00";
    row.getCell(3).numFmt = "0.00";
    row.getCell(4).value = { formula: `MAX(0,C${rowNum}-${overtimeThreshold})` };
    row.getCell(4).numFmt = "0.00";
    // Week's straight-time pay: sum of the daily Estimated Pay (J) rows in
    // this week. Inlined here rather than kept in a visible helper cell, so
    // it still recalculates when a Job is picked on a daily row.
    const regularPay =
      dayRows.length > 0
        ? `SUMIF(N${dailyFirstDataRow}:N${dailyLastRow},A${rowNum},J${dailyFirstDataRow}:J${dailyLastRow})`
        : "0";
    // Regular pay plus the half-time overtime premium at the week's
    // average rate (regular pay / worked hours).
    row.getCell(5).value = {
      formula: `${regularPay}+IF(C${rowNum}=0,0,(${regularPay}/C${rowNum})*D${rowNum}*0.5)`,
    };
    row.getCell(5).numFmt = '"$"#,##0.00';
  });

  const summaryLastRow = summaryFirstRow + weeklyTotals.length - 1;
  if (weeklyTotals.length > 0) {
    const totalRow = summaryLastRow + 1;
    const row = sheet.getRow(totalRow);
    row.getCell(1).value = "Total";
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = { formula: `SUM(B${summaryFirstRow}:B${summaryLastRow})` };
    row.getCell(2).numFmt = "0.00";
    row.getCell(3).value = { formula: `SUM(C${summaryFirstRow}:C${summaryLastRow})` };
    row.getCell(3).numFmt = "0.00";
    row.getCell(4).value = { formula: `SUM(D${summaryFirstRow}:D${summaryLastRow})` };
    row.getCell(4).numFmt = "0.00";
    row.getCell(5).value = { formula: `SUM(E${summaryFirstRow}:E${summaryLastRow})` };
    row.getCell(5).numFmt = '"$"#,##0.00';
  }

  // ---- Daily breakdown block ----
  sheet.mergeCells(dailyHeaderRowNum - 1, 1, dailyHeaderRowNum - 1, 12);
  const dailyTitleCell = sheet.getCell(dailyHeaderRowNum - 1, 1);
  dailyTitleCell.value = hasJobs
    ? "Daily Breakdown - pick a Job on any row to update pay"
    : "Daily Breakdown";
  dailyTitleCell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
  sheet.getRow(dailyHeaderRowNum - 1).height = 26;

  const dailyHeader = sheet.getRow(dailyHeaderRowNum);
  [
    "Date",
    "Job Site",
    "Job",
    "Hourly Rate",
    "Clock In",
    "Clock Out",
    HOURS_COLUMNS.shift.label,
    HOURS_COLUMNS.break.label,
    HOURS_COLUMNS.worked.label,
    "Estimated Pay (Excluding Break)",
    "Notes",
    "Adjusted",
  ].forEach((h, i) => (dailyHeader.getCell(i + 1).value = h));
  styleHeaderRow(dailyHeader);
  wrapHeaderRow(dailyHeader);
  addHoursHeaderNotes(dailyHeader, { shift: 7, break: 8, worked: 9 });
  // Total Worked (I) used to be a hidden helper - it's now the requested
  // visible column between Break and Estimated Pay, so it stays shown.
  sheet.getColumn(13).hidden = true; // Default Rate (helper)
  sheet.getColumn(14).hidden = true; // Week Of (helper)

  const defaultJobName = defaultJobId
    ? jobs.find((j) => j.id === defaultJobId)?.name ?? null
    : null;

  dayRows.forEach((d, idx) => {
    const r = dailyFirstDataRow + idx;
    const row = sheet.getRow(r);
    row.height = 20;
    row.getCell(1).value = d.dateLabel;
    row.getCell(2).value = d.siteName;
    row.getCell(3).value = hasJobs ? defaultJobName ?? "(Default)" : null;
    row.getCell(13).value = hourlyRate;

    if (hasJobs) {
      row.getCell(4).value = {
        formula: `IF(OR(C${r}="",C${r}="(Default)"),M${r},VLOOKUP(C${r},JobsTable,2,FALSE))`,
      };
      row.getCell(3).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ["JobsList"],
      };
    } else {
      row.getCell(4).value = { formula: `M${r}` };
    }
    row.getCell(4).numFmt = '"$"#,##0.00';

    row.getCell(5).value = d.clockInLabel;
    row.getCell(6).value = d.clockOutLabel;
    row.getCell(7).value = Number(d.hours.toFixed(2));
    row.getCell(7).numFmt = "0.00";
    row.getCell(8).value = Number(d.breakHours.toFixed(2));
    row.getCell(8).numFmt = "0.00";
    row.getCell(9).value = { formula: `G${r}-H${r}` };
    row.getCell(9).numFmt = "0.00";
    row.getCell(10).value = { formula: `D${r}*I${r}` };
    row.getCell(10).numFmt = '"$"#,##0.00';
    row.getCell(11).value = d.note || "-";
    row.getCell(11).alignment = { wrapText: true, vertical: "middle" };
    row.getCell(12).value = d.adjusted ? "Adjusted" : "";
    row.getCell(14).value = d.weekLabel;
  });

  styleDataRows(sheet, dailyHeaderRowNum);

  // styleDataRows resets alignment on every cell, so the per-cell
  // alignment for this sheet has to be applied after it.
  dayRows.forEach((d, idx) => {
    const row = sheet.getRow(dailyFirstDataRow + idx);
    // Indent Clock In / Clock Out so they don't run into the right-aligned
    // Hourly Rate next to them.
    row.getCell(5).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    row.getCell(6).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    row.getCell(11).alignment = { vertical: "middle", wrapText: true };
    // Excel won't grow a row to fit wrapped text if the row has a fixed
    // height, so size it from the note length (~15pt per line).
    const lines = Math.max(1, Math.ceil((d.note || "-").length / (notesWidth - 2)));
    row.height = Math.max(20, lines * 15 + 4);
  });

  sheet.views = [{ state: "frozen", ySplit: dailyHeaderRowNum }];
}

// ====================================================================
// Overtime (Task 1) - Overtime toggle ON only. Separate builders so the
// Overtime OFF sheets above stay exactly as they were.
// ====================================================================

// Same hidden Jobs sheet as addJobsLookupSheet plus column C: each active
// title's OT $/hr (its fixed Overtime rate, else rate x multiplier).
// JobsTable becomes A:C here.
export function addJobsLookupSheetWithOvertime(
  workbook: Workbook,
  jobs: Job[],
  multiplier: number
): { count: number; activeIds: Set<string> } | null {
  const activeJobs = jobs.filter((j) => j.active);
  if (activeJobs.length === 0) return null;

  const sheet = workbook.addWorksheet("Jobs");
  sheet.state = "veryHidden";

  sheet.getCell(1, 1).value = "(Default)";
  sheet.getCell(1, 2).value = null;
  sheet.getCell(1, 3).value = null;

  activeJobs.forEach((j, idx) => {
    const r = idx + 2;
    sheet.getCell(r, 1).value = j.name;
    sheet.getCell(r, 2).value = j.hourlyRate;
    sheet.getCell(r, 3).value = j.overtimeRate ?? j.hourlyRate * multiplier;
  });

  const count = activeJobs.length + 1;
  workbook.definedNames.add(`'Jobs'!$A$1:$A$${count}`, "JobsList");
  workbook.definedNames.add(`'Jobs'!$A$1:$C$${count}`, "JobsTable");

  return { count, activeIds: new Set(activeJobs.map((j) => j.id)) };
}

export const PAYROLL_DAY_TOTAL_LABEL = "Day total";

// Decision 4B: wraps a live Job-dropdown formula so the value frozen at
// approval is used while the row still shows the approved job's name.
function frozenOr(cell: string, label: string, frozen: number | null, live: string): string {
  if (frozen === null) return live;
  return `IF(${cell}="${label.replace(/"/g, '""')}",${frozen},${live})`;
}

// Payroll Hours with Overtime ON. Hours columns (Nov 25 change):
// Shift Hours | Break | Regular Hours | Overtime | Total Worked, where
// Regular Hours is a live formula (Total Worked - Overtime). Layout:
// Summary: A Employee | B Shift Hours | C Break | D Regular Hours |
//   E Overtime | F Total Worked | G Sessions | H Open Sessions |
//   I Hourly Rate ("Mixed" with 2+ jobs) | J Estimated Pay | K Company
// Daily:   A Employee | B Date | C Job | D Hourly Rate | E Shift Hours |
//   F Break | G Regular Hours (=I-H) | H Overtime | I Total Worked |
//   J Estimated Pay | K Company | L (hidden) Default Rate |
//   M (hidden) OT Rate | N (hidden) Default OT Rate
// Est. Pay = D x G + M x H. A single-job day keeps the live Job dropdown
// (rate and OT rate follow the picked job). A day with 2+ jobs is split into
// locked job rows (plain values) plus a "Day total" row; the summary
// formulas skip the Day total rows so nothing counts twice, and the Day
// total rows' SUMs are exempt from Excel's "inconsistent formula" warning.
export function addPayrollSheetWithOvertime(
  workbook: Workbook,
  summaries: EmployeeSummary[],
  jobs: Job[],
  rows: OvertimeReportRow[],
  multiplier: number,
  roundTotalMinutes: RoundingIncrement,
  companyName: string,
  startDate: string,
  endDate: string
) {
  const SHEET_NAME = "Payroll Hours";
  const sheet = workbook.addWorksheet(SHEET_NAME);
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  sheet.columns = [
    { width: 24 }, // A
    { width: 16 }, // B
    { width: 16 }, // C
    { width: 16 }, // D
    { width: 14 }, // E
    { width: 14 }, // F
    { width: 14 }, // G
    { width: 14 }, // H
    { width: 14 }, // I
    { width: 34 }, // J Estimated Pay (Excluding Break) - full header shows
    { width: 22 }, // K
    { width: 12 }, // L
    { width: 12 }, // M
    { width: 12 }, // N
  ];

  addTitleRow(sheet, `Payroll Hours: ${rangeLabel}`, 11);

  const jobsInfo = addJobsLookupSheetWithOvertime(workbook, jobs, multiplier);
  const hasJobs = jobsInfo != null;

  const sortedSummaries = sortByCompanyThen(
    summaries,
    (s) => companyLabelFor(s.subcontractorName, companyName),
    companyName,
    (a, b) => a.employeeName.localeCompare(b.employeeName)
  );

  // 2A: an employee who worked 2+ jobs in the period has no single rate.
  const jobsByEmployee = new Map<string, Set<string>>();
  for (const d of rows) {
    if (d.kind === "total") continue;
    const set = jobsByEmployee.get(d.employeeId) ?? new Set<string>();
    set.add(d.jobId ?? "(default)");
    jobsByEmployee.set(d.employeeId, set);
  }

  const summaryHeaderRowNum = 2;
  const summaryHeader = sheet.getRow(summaryHeaderRowNum);
  [
    "Employee",
    HOURS_COLUMNS.shift.label,
    HOURS_COLUMNS.break.label,
    HOURS_COLUMNS.regular.label,
    HOURS_COLUMNS.overtime.label,
    HOURS_COLUMNS.worked.label,
    "Sessions",
    "Open Sessions",
    "Hourly Rate",
    "Estimated Pay (Excluding Break)",
    "Company",
  ].forEach((h, i) => (summaryHeader.getCell(i + 1).value = h));
  styleHeaderRow(summaryHeader);
  addHoursHeaderNotes(summaryHeader, { shift: 2, break: 3, regular: 4, overtime: 5, worked: 6 });

  const summaryFirstDataRow = summaryHeaderRowNum + 1;
  sortedSummaries.forEach((s, idx) => {
    const rowNum = summaryFirstDataRow + idx;
    const row = sheet.getRow(rowNum);
    row.height = 20;
    row.getCell(1).value = s.employeeName;
    row.getCell(2).value = Number(s.totalHours.toFixed(2));
    for (const c of [2, 3, 4, 5, 6]) row.getCell(c).numFmt = "0.00";
    // Regular Hours = Total Worked - Overtime, live.
    row.getCell(4).value = { formula: `F${rowNum}-E${rowNum}` };
    row.getCell(7).value = s.sessionCount;
    row.getCell(8).value = s.openSessions;
    const mixed = (jobsByEmployee.get(s.employeeId)?.size ?? 0) >= 2;
    row.getCell(9).value = mixed ? MIXED_RATE_LABEL : s.hourlyRate;
    row.getCell(9).numFmt = '"$"#,##0.00';
    if (mixed) row.getCell(9).alignment = { horizontal: "right" };
    row.getCell(10).numFmt = '"$"#,##0.00';
    row.getCell(11).value = companyLabelFor(s.subcontractorName, companyName);
  });
  const summaryLastRow = summaryFirstDataRow + sortedSummaries.length - 1;

  const dailyTitleRow = summaryLastRow + 3;
  sheet.mergeCells(dailyTitleRow, 1, dailyTitleRow, 11);
  const titleCell = sheet.getCell(dailyTitleRow, 1);
  titleCell.value = hasJobs
    ? "Daily Breakdown - pick a Job on any single-job day to update that day's pay and the totals above"
    : "Daily Breakdown";
  titleCell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
  sheet.getRow(dailyTitleRow).height = 26;

  const dailyHeaderRow = dailyTitleRow + 1;
  const dailyHeader = sheet.getRow(dailyHeaderRow);
  [
    "Employee",
    "Date",
    "Job",
    "Hourly Rate",
    HOURS_COLUMNS.shift.label,
    HOURS_COLUMNS.break.label,
    HOURS_COLUMNS.regular.label,
    HOURS_COLUMNS.overtime.label,
    HOURS_COLUMNS.worked.label,
    "Estimated Pay (Excluding Break)",
    "Company",
  ].forEach((h, i) => (dailyHeader.getCell(i + 1).value = h));
  dailyHeader.getCell(12).value = "Default Rate";
  dailyHeader.getCell(13).value = "OT Rate";
  dailyHeader.getCell(14).value = "Default OT Rate";
  styleHeaderRow(dailyHeader);
  addHoursHeaderNotes(dailyHeader, { shift: 5, break: 6, regular: 7, overtime: 8, worked: 9 });
  sheet.getColumn(12).hidden = true;
  sheet.getColumn(13).hidden = true;
  sheet.getColumn(14).hidden = true;

  const kindOrder: Record<OvertimeReportRow["kind"], number> = { single: 0, job: 0, total: 1 };
  const sortedRows = sortByCompanyThen(
    rows,
    (d) => companyLabelFor(d.subcontractorName, companyName),
    companyName,
    (a, b) =>
      a.employeeName !== b.employeeName
        ? a.employeeName.localeCompare(b.employeeName)
        : a.date !== b.date
          ? (a.date < b.date ? -1 : 1)
          : kindOrder[a.kind] - kindOrder[b.kind]
  );

  let r = dailyHeaderRow + 1;
  let prevEmployee: string | null = null;
  let dayJobRowStart: number | null = null;
  const totalRowNumbers: number[] = [];

  sortedRows.forEach((d) => {
    if (prevEmployee !== null && d.employeeName !== prevEmployee) {
      sheet.getRow(r).height = 10;
      r += 1;
    }
    prevEmployee = d.employeeName;

    const row = sheet.getRow(r);
    row.height = 20;
    row.getCell(1).value = d.employeeName;
    const parsed = parseDateKey(d.date);
    row.getCell(2).value = parsed ? formatDatePart(parsed) : d.date;
    row.getCell(11).value = companyLabelFor(d.subcontractorName, companyName);
    for (const c of [5, 6, 7, 8, 9]) row.getCell(c).numFmt = "0.00";
    for (const c of [4, 10, 12, 13, 14]) row.getCell(c).numFmt = '"$"#,##0.00';
    // Regular Hours = Total Worked - Overtime, live on every row (incl.
    // the Day total).
    row.getCell(7).value = { formula: `I${r}-H${r}` };

    if (d.kind === "total") {
      const first = dayJobRowStart ?? r;
      const last = r - 1;
      row.getCell(3).value = PAYROLL_DAY_TOTAL_LABEL;
      for (const [c, col] of [[5, "E"], [6, "F"], [8, "H"], [9, "I"], [10, "J"]] as const) {
        row.getCell(c).value = { formula: `SUM(${col}${first}:${col}${last})` };
      }
      row.font = { bold: true };
      totalRowNumbers.push(r);
      dayJobRowStart = null;
      r += 1;
      return;
    }
    if (d.kind === "job" && dayJobRowStart === null) dayJobRowStart = r;

    row.getCell(5).value = Number((d.clockedMinutes / 60).toFixed(2));
    row.getCell(6).value = Number((d.breakMinutes / 60).toFixed(2));
    row.getCell(8).value = Number((d.overtimeMinutes / 60).toFixed(2));
    row.getCell(9).value = Number((d.workedMinutes / 60).toFixed(2));
    row.getCell(12).value = d.defaultRate;
    row.getCell(14).value = d.defaultOvertimeRate;

    const jobIsPickable = d.jobId === null || (jobsInfo?.activeIds.has(d.jobId) ?? false);
    if (d.kind === "single" && hasJobs && jobIsPickable) {
      // Live dropdown, same as today: rate and OT rate follow the job.
      const label = d.jobId ? d.jobLabel : "(Default)";
      row.getCell(3).value = label;
      row.getCell(3).dataValidation = { type: "list", allowBlank: true, formulae: ["JobsList"] };
      row.getCell(4).value = {
        formula: frozenOr(
          `C${r}`,
          label,
          d.ratesFrozen ? d.rate : null,
          `IF(OR(C${r}="",C${r}="(Default)"),L${r},VLOOKUP(C${r},JobsTable,2,FALSE))`
        ),
      };
      row.getCell(13).value = d.isSubcontractor
        ? { formula: `D${r}` }
        : {
            formula: frozenOr(
              `C${r}`,
              label,
              d.ratesFrozen ? d.overtimeRate : null,
              `IF(OR(C${r}="",C${r}="(Default)"),N${r},VLOOKUP(C${r},JobsTable,3,FALSE))`
            ),
          };
    } else {
      // Locked: a job row of a 2+ job day, or a job that can't be picked.
      row.getCell(3).value = hasJobs || d.jobId ? d.jobLabel : null;
      row.getCell(4).value = d.rate;
      row.getCell(13).value = d.overtimeRate;
    }
    row.getCell(10).value = { formula: `D${r}*G${r}+M${r}*H${r}` };
    r += 1;
  });

  for (const tr of totalRowNumbers) markIgnoredFormulaErrors(workbook, SHEET_NAME, `A${tr}:N${tr}`);

  const first = dailyHeaderRow + 1;
  const last = r - 1;
  const notTotal = `C${first}:C${last},"<>${PAYROLL_DAY_TOTAL_LABEL}"`;
  sortedSummaries.forEach((s, idx) => {
    const row = summaryFirstDataRow + idx;
    if (sortedRows.length > 0) {
      const sumOf = (col: string) => `SUMIFS(${col}${first}:${col}${last},A${first}:A${last},A${row},${notTotal})`;
      // Shift Hours + Break from the same day rows as Total Worked, so
      // Shift - Break = Total Worked holds (Automatic Break once per day).
      sheet.getCell(row, 2).value = { formula: sumOf("E") };
      sheet.getCell(row, 3).value = { formula: sumOf("F") };
      sheet.getCell(row, 5).value = { formula: sumOf("H") };
      sheet.getCell(row, 6).value =
        roundTotalMinutes === 0
          ? { formula: sumOf("I") }
          : { formula: `CEILING(${sumOf("I")},${roundTotalMinutes / 60})` };
      sheet.getCell(row, 10).value = { formula: sumOf("J") };
    } else {
      sheet.getCell(row, 3).value = s.totalBreakHours;
      sheet.getCell(row, 5).value = 0;
      sheet.getCell(row, 6).value = 0;
      sheet.getCell(row, 10).value = 0;
    }
  });

  styleDataRows(sheet, 2);
  sheet.views = [{ state: "frozen", ySplit: 2 }];
}

// One session row of the Time History sheet with Overtime ON.
export type EmployeeHistoryOvertimeRow = EmployeeHistoryDayRow & {
  jobId: string | null;
  jobName: string | null;
  rate: number | null;
  overtimeHours: number;
  overtimeRate: number | null;
  // Decision 4B: rate / overtimeRate frozen at approval.
  ratesFrozen?: boolean;
};

// Time History with Overtime ON (decision 11): the weekly OT comes from the
// shared overtime function (daily + weekly, per-job OT rate, rounding)
// instead of the old flat weekly 1.5x estimate. Hours columns (Nov 25):
// Shift Hours | Break | Regular Hours (live) | Overtime | Total Worked.
// Weekly: A Week Of | B Shift Hours | C Break | D Regular Hours |
//   E Overtime | F Total Worked | G Est. Pay
// Daily:  A Date | B Job Site | C Job | D Hourly Rate | E Clock In |
//   F Clock Out | G Shift Hours | H Break | I Regular Hours (=K-J) |
//   J Overtime | K Total Worked (=G-H) | L Est. Pay | M Notes | N Adjusted |
//   O (hidden) Default Rate | P (hidden) Week Of | Q (hidden) OT Rate |
//   R (hidden) Default OT Rate
export function addEmployeeHistorySheetWithOvertime(
  workbook: Workbook,
  employeeName: string,
  defaultRate: number | null,
  defaultOvertimeRate: number | null,
  isSubcontractor: boolean,
  jobs: Job[],
  multiplier: number,
  dayRows: EmployeeHistoryOvertimeRow[],
  weekLabels: string[],
  startDate: string,
  endDate: string
) {
  const sheet = workbook.addWorksheet("Time History");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  const longest = (values: (string | null | undefined)[]) =>
    values.reduce((max, v) => Math.max(max, (v ?? "").length), 0);
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const siteWidth = clamp(longest(dayRows.map((d) => d.siteName)) + 2, 16, 40);
  const jobWidth = clamp(longest([...jobs.map((j) => j.name), "(Default)"]) + 4, 16, 32);
  const notesWidth = clamp(longest(dayRows.map((d) => d.note)) + 2, 30, 50);

  sheet.columns = [
    { width: 14 }, // A Date / Week Of
    { width: siteWidth }, // B Job Site / Shift Hours
    { width: jobWidth }, // C Job / Break
    { width: 15 }, // D Hourly Rate / Regular Hours
    { width: 19 }, // E Clock In / Overtime
    { width: 12 }, // F Clock Out / Total Worked
    { width: 12 }, // G Shift Hours / Est. Pay
    { width: 9 }, // H Break
    { width: 12 }, // I Regular Hours
    { width: 11 }, // J Overtime
    { width: 12 }, // K Total Worked
    { width: 19 }, // L Est. Pay
    { width: notesWidth }, // M Notes
    { width: 11 }, // N Adjusted
    { width: 12 }, // O
    { width: 14 }, // P
    { width: 12 }, // Q
    { width: 12 }, // R
  ];

  const wrapHeaderRow = (row: Row) => {
    row.eachCell((cell: Cell) => {
      cell.alignment = { ...cell.alignment, wrapText: true };
    });
    row.height = 32;
  };

  addTitleRow(sheet, `${employeeName} - Time History: ${rangeLabel}`, 14);

  const jobsInfo = addJobsLookupSheetWithOvertime(workbook, jobs, multiplier);
  const hasJobs = jobsInfo != null;

  const summaryHeaderRowNum = 2;
  const summaryHeader = sheet.getRow(summaryHeaderRowNum);
  [
    "Week Of",
    HOURS_COLUMNS.shift.label,
    HOURS_COLUMNS.break.label,
    HOURS_COLUMNS.regular.label,
    HOURS_COLUMNS.overtime.label,
    HOURS_COLUMNS.worked.label,
    "Estimated Pay (Excluding Break)",
  ].forEach((h, i) => (summaryHeader.getCell(i + 1).value = h));
  styleHeaderRow(summaryHeader);
  wrapHeaderRow(summaryHeader);
  addHoursHeaderNotes(summaryHeader, { shift: 2, break: 3, regular: 4, overtime: 5, worked: 6 });

  const summaryFirstRow = summaryHeaderRowNum + 1;
  const dailyHeaderRowNum = summaryFirstRow + weekLabels.length + 2;
  const dailyFirstDataRow = dailyHeaderRowNum + 1;
  const dailyLastRow = dailyFirstDataRow + dayRows.length - 1;

  weekLabels.forEach((weekLabel, idx) => {
    const rowNum = summaryFirstRow + idx;
    const row = sheet.getRow(rowNum);
    row.height = 20;
    row.getCell(1).value = weekLabel;
    const sumOf = (col: string) =>
      dayRows.length > 0
        ? { formula: `SUMIF(P${dailyFirstDataRow}:P${dailyLastRow},A${rowNum},${col}${dailyFirstDataRow}:${col}${dailyLastRow})` }
        : 0;
    row.getCell(2).value = sumOf("G");
    row.getCell(3).value = sumOf("H");
    row.getCell(4).value = { formula: `F${rowNum}-E${rowNum}` };
    row.getCell(5).value = sumOf("J");
    row.getCell(6).value = sumOf("K");
    row.getCell(7).value = sumOf("L");
    for (const c of [2, 3, 4, 5, 6]) row.getCell(c).numFmt = "0.00";
    row.getCell(7).numFmt = '"$"#,##0.00';
  });

  const summaryLastRow = summaryFirstRow + weekLabels.length - 1;
  if (weekLabels.length > 0) {
    const totalRowNum = summaryLastRow + 1;
    const row = sheet.getRow(totalRowNum);
    row.getCell(1).value = "Total";
    row.getCell(1).font = { bold: true };
    for (const [c, col] of [[2, "B"], [3, "C"], [5, "E"], [6, "F"], [7, "G"]] as const) {
      row.getCell(c).value = { formula: `SUM(${col}${summaryFirstRow}:${col}${summaryLastRow})` };
      row.getCell(c).numFmt = c === 7 ? '"$"#,##0.00' : "0.00";
    }
    row.getCell(4).value = { formula: `F${totalRowNum}-E${totalRowNum}` };
    row.getCell(4).numFmt = "0.00";
  }

  sheet.mergeCells(dailyHeaderRowNum - 1, 1, dailyHeaderRowNum - 1, 14);
  const dailyTitleCell = sheet.getCell(dailyHeaderRowNum - 1, 1);
  dailyTitleCell.value = hasJobs ? "Daily Breakdown - pick a Job on any row to update pay" : "Daily Breakdown";
  dailyTitleCell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
  sheet.getRow(dailyHeaderRowNum - 1).height = 26;

  const dailyHeader = sheet.getRow(dailyHeaderRowNum);
  [
    "Date",
    "Job Site",
    "Job",
    "Hourly Rate",
    "Clock In",
    "Clock Out",
    HOURS_COLUMNS.shift.label,
    HOURS_COLUMNS.break.label,
    HOURS_COLUMNS.regular.label,
    HOURS_COLUMNS.overtime.label,
    HOURS_COLUMNS.worked.label,
    "Estimated Pay (Excluding Break)",
    "Notes",
    "Adjusted",
  ].forEach((h, i) => (dailyHeader.getCell(i + 1).value = h));
  styleHeaderRow(dailyHeader);
  wrapHeaderRow(dailyHeader);
  addHoursHeaderNotes(dailyHeader, { shift: 7, break: 8, regular: 9, overtime: 10, worked: 11 });
  for (const c of [15, 16, 17, 18]) sheet.getColumn(c).hidden = true;

  dayRows.forEach((d, idx) => {
    const r = dailyFirstDataRow + idx;
    const row = sheet.getRow(r);
    row.height = 20;
    row.getCell(1).value = d.dateLabel;
    row.getCell(2).value = d.siteName;
    row.getCell(15).value = defaultRate;
    row.getCell(18).value = defaultOvertimeRate;

    const jobIsPickable = d.jobId === null || (jobsInfo?.activeIds.has(d.jobId) ?? false);
    if (hasJobs && jobIsPickable) {
      const label = d.jobId ? d.jobName ?? "(Default)" : "(Default)";
      row.getCell(3).value = label;
      row.getCell(3).dataValidation = { type: "list", allowBlank: true, formulae: ["JobsList"] };
      row.getCell(4).value = {
        formula: frozenOr(
          `C${r}`,
          label,
          d.ratesFrozen ? d.rate : null,
          `IF(OR(C${r}="",C${r}="(Default)"),O${r},VLOOKUP(C${r},JobsTable,2,FALSE))`
        ),
      };
      row.getCell(17).value = isSubcontractor
        ? { formula: `D${r}` }
        : {
            formula: frozenOr(
              `C${r}`,
              label,
              d.ratesFrozen ? d.overtimeRate : null,
              `IF(OR(C${r}="",C${r}="(Default)"),R${r},VLOOKUP(C${r},JobsTable,3,FALSE))`
            ),
          };
    } else {
      row.getCell(3).value = d.jobName;
      row.getCell(4).value = d.rate;
      row.getCell(17).value = d.overtimeRate;
    }
    row.getCell(4).numFmt = '"$"#,##0.00';
    row.getCell(17).numFmt = '"$"#,##0.00';
    row.getCell(18).numFmt = '"$"#,##0.00';

    row.getCell(5).value = d.clockInLabel;
    row.getCell(6).value = d.clockOutLabel;
    row.getCell(7).value = Number(d.hours.toFixed(2));
    row.getCell(8).value = Number(d.breakHours.toFixed(2));
    row.getCell(9).value = { formula: `K${r}-J${r}` };
    row.getCell(10).value = Number(d.overtimeHours.toFixed(2));
    row.getCell(11).value = { formula: `G${r}-H${r}` };
    for (const c of [7, 8, 9, 10, 11]) row.getCell(c).numFmt = "0.00";
    row.getCell(12).value = { formula: `D${r}*I${r}+Q${r}*J${r}` };
    row.getCell(12).numFmt = '"$"#,##0.00';
    row.getCell(13).value = d.note || "-";
    row.getCell(14).value = d.adjusted ? "Adjusted" : "";
    row.getCell(16).value = d.weekLabel;
  });

  styleDataRows(sheet, dailyHeaderRowNum);

  dayRows.forEach((d, idx) => {
    const row = sheet.getRow(dailyFirstDataRow + idx);
    row.getCell(5).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    row.getCell(6).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    row.getCell(13).alignment = { vertical: "middle", wrapText: true };
    const lines = Math.max(1, Math.ceil((d.note || "-").length / (notesWidth - 2)));
    row.height = Math.max(20, lines * 15 + 4);
  });

  sheet.views = [{ state: "frozen", ySplit: dailyHeaderRowNum }];
}
