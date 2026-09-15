import type { EmployeeSummary, Job } from "@/lib/types";
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
  dateLabel: string;
  hours: number;
  breakHours: number;
  defaultRate: number | null;
  defaultJobName: string | null;
  subcontractorName: string | null;
};

export function buildDayRows(
  summaries: EmployeeSummary[],
  hoursByEmployeeDay: Map<string, number>,
  breakHoursByEmployeeDay: Map<string, number>,
  employeeJobIdById: Map<string, string | null>,
  jobs: Job[]
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

    const jobId = employeeJobIdById.get(employeeId) ?? null;
    const defaultJobName = jobId ? jobNameById.get(jobId) ?? null : null;

    rows.push({
      employeeName,
      dateLabel,
      hours,
      breakHours: breakHoursByEmployeeDay.get(key) ?? 0,
      defaultRate: rateById.get(employeeId) ?? null,
      defaultJobName,
      subcontractorName: companyById.get(employeeId) ?? null,
    });
  }

  rows.sort((a, b) =>
    a.employeeName === b.employeeName
      ? (a.dateLabel < b.dateLabel ? -1 : 1)
      : a.employeeName.localeCompare(b.employeeName)
  );
  return rows;
}

// Column layout (shared by both the summary block and the daily breakdown
// block, since they occupy the same worksheet):
// A Employee            | A Employee
// B Total Hours         | B Date
// C Total Break Hrs     | C Job
// D Sessions            | D Hourly Rate
// E Open Sessions       | E Hours
// F Hourly Rate         | F Break
// G Estimated Pay       | G Estimated Pay
// H Company             | H Company
// I (hidden) Default Rate - daily block only
//
// Total Break Hrs (C) and Estimated Pay (G) in the summary block are both
// SUMIF formulas pulling from the daily rows below, keyed on employee name.
// This is what makes them update live if someone edits Break or the Job
// dropdown directly in Excel - Total Hours (B) stays a plain number since
// gross clocked hours aren't meant to be hand-edited the way Break is.
// Column H was previously an unused narrow spacer; it's now the Company
// column in both blocks, so none of the existing formulas (which only
// reference A, C, D, F, G, I) needed renumbering.
export function addPayrollSheet(
  workbook: any,
  summaries: EmployeeSummary[],
  jobs: Job[],
  dayRows: PayrollDayRow[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const sheet = workbook.addWorksheet("Payroll Hours");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  sheet.columns = [
    { width: 24 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 22 },
    { width: 12 },
  ];

  addTitleRow(sheet, `Payroll Hours: ${rangeLabel}`, 8);

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
    "Total Hours",
    "Total Break Hrs",
    "Sessions",
    "Open Sessions",
    "Hourly Rate",
    "Estimated Pay",
    "Company",
  ].forEach((h, i) => (summaryHeader.getCell(i + 1).value = h));
  styleHeaderRow(summaryHeader);

  const summaryFirstDataRow = summaryHeaderRowNum + 1;
  sortedSummaries.forEach((s, idx) => {
    const rowNum = summaryFirstDataRow + idx;
    const row = sheet.getRow(rowNum);
    row.height = 20;
    row.getCell(1).value = s.employeeName;
    row.getCell(2).value = Number(s.totalHours.toFixed(2));
    row.getCell(2).numFmt = "0.00";
    row.getCell(3).numFmt = "0.00";
    row.getCell(4).value = s.sessionCount;
    row.getCell(5).value = s.openSessions;
    row.getCell(6).value = s.hourlyRate;
    row.getCell(6).numFmt = '"$"#,##0.00';
    row.getCell(7).numFmt = '"$"#,##0.00';
    row.getCell(8).value = companyLabelFor(s.subcontractorName, companyName);
  });

  const summaryLastRow = summaryFirstDataRow + sortedSummaries.length - 1;

  const dailyTitleRow = summaryLastRow + 3;
  sheet.mergeCells(dailyTitleRow, 1, dailyTitleRow, 8);
  const titleCell = sheet.getCell(dailyTitleRow, 1);
  titleCell.value = hasJobs
    ? "Daily Breakdown - pick a Job on any row to update that day's pay and the totals above"
    : "Daily Breakdown";
  titleCell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
  sheet.getRow(dailyTitleRow).height = 26;

  const dailyHeaderRow = dailyTitleRow + 1;
  const dailyHeader = sheet.getRow(dailyHeaderRow);
  ["Employee", "Date", "Job", "Hourly Rate", "Hours", "Break", "Estimated Pay", "Company"].forEach(
    (h, i) => (dailyHeader.getCell(i + 1).value = h)
  );
  dailyHeader.getCell(9).value = "Default Rate";
  styleHeaderRow(dailyHeader);
  sheet.getColumn(9).hidden = true;

  const sortedDayRows = sortByCompanyThen(
    dayRows,
    (d) => companyLabelFor(d.subcontractorName, companyName),
    companyName,
    (a, b) =>
      a.employeeName === b.employeeName
        ? a.dateLabel < b.dateLabel
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
    row.getCell(9).value = d.defaultRate;

    if (hasJobs) {
      row.getCell(4).value = {
        formula: `IF(OR(C${r}="",C${r}="(Default)"),I${r},VLOOKUP(C${r},JobsTable,2,FALSE))`,
      };
      row.getCell(3).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ["JobsList"],
      };
    } else {
      row.getCell(4).value = { formula: `I${r}` };
    }
    row.getCell(4).numFmt = '"$"#,##0.00';

    row.getCell(5).value = Number(d.hours.toFixed(2));
    row.getCell(5).numFmt = "0.00";

    row.getCell(6).value = Number(d.breakHours.toFixed(2));
    row.getCell(6).numFmt = "0.00";

    // Est. Pay = rate x (gross hours - unpaid break hours)
    row.getCell(7).value = { formula: `D${r}*(E${r}-F${r})` };
    row.getCell(7).numFmt = '"$"#,##0.00';

    row.getCell(8).value = companyLabelFor(d.subcontractorName, companyName);

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
      sheet.getCell(row, 7).value = {
        formula: `SUMIF(A${dailyFirstDataRow}:A${dailyLastRow},A${row},G${dailyFirstDataRow}:G${dailyLastRow})`,
      };
    } else {
      sheet.getCell(row, 3).value = s.totalBreakHours;
      sheet.getCell(row, 7).value = s.estimatedPay;
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

  sheet.columns = [
    { width: 14 }, // A Date
    { width: 20 }, // B Job Site
    { width: 16 }, // C Job
    { width: 13 }, // D Hourly Rate
    { width: 11 }, // E Clock In
    { width: 11 }, // F Clock Out
    { width: 9 },  // G Hours
    { width: 9 },  // H Break
    { width: 12 }, // I Net Hours (hidden)
    { width: 13 }, // J Estimated Pay
    { width: 30 }, // K Notes
    { width: 10 }, // L Adjusted
    { width: 12 }, // M Default Rate (hidden)
    { width: 14 }, // N Week Of (hidden)
  ];

  addTitleRow(sheet, `${employeeName} - Time History: ${rangeLabel}`, 12);

  const jobsInfo = addJobsLookupSheet(workbook, jobs);
  const hasJobs = jobsInfo != null;

  // ---- Weekly summary block ----
  const summaryHeaderRowNum = 2;
  const summaryHeader = sheet.getRow(summaryHeaderRowNum);
  ["Week Of", "Total Hours", "Regular Hours", "Overtime Hours", "Estimated Pay"].forEach(
    (h, i) => (summaryHeader.getCell(i + 1).value = h)
  );
  styleHeaderRow(summaryHeader);

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
        formula: `SUMIF(N${dailyFirstDataRow}:N${dailyLastRow},A${rowNum},I${dailyFirstDataRow}:I${dailyLastRow})`,
      };
      row.getCell(9).value = {
        formula: `SUMIF(N${dailyFirstDataRow}:N${dailyLastRow},A${rowNum},J${dailyFirstDataRow}:J${dailyLastRow})`,
      };
    } else {
      row.getCell(2).value = w.hours;
      row.getCell(9).value = 0;
    }
    row.getCell(2).numFmt = "0.00";
    row.getCell(3).value = { formula: `MIN(${overtimeThreshold},B${rowNum})` };
    row.getCell(3).numFmt = "0.00";
    row.getCell(4).value = { formula: `MAX(0,B${rowNum}-${overtimeThreshold})` };
    row.getCell(4).numFmt = "0.00";
    row.getCell(5).value = {
      formula: `I${rowNum}+IF(B${rowNum}=0,0,(I${rowNum}/B${rowNum})*D${rowNum}*0.5)`,
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
    "Hours",
    "Break",
    "Net Hours",
    "Estimated Pay",
    "Notes",
    "Adjusted",
  ].forEach((h, i) => (dailyHeader.getCell(i + 1).value = h));
  styleHeaderRow(dailyHeader);
  sheet.getColumn(9).hidden = true; // Net Hours (helper)
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
  sheet.views = [{ state: "frozen", ySplit: dailyHeaderRowNum }];
}
