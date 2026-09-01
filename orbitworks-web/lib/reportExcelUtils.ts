import type {
  EmployeeSummary,
  SessionRecord,
  EmployeeExportRecord,
  AttendanceRecord,
  ShiftNote,
  Job,
} from "@/lib/types";

const HEADER_FILL = "FF3B6FE0";
const HEADER_FONT_COLOR = "FFFFFFFF";

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

function parseMaybeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDatePart(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimePart(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHoursMinutes(hours: number | null | undefined): string {
  if (hours == null) return "-";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function formatDateRangeLabel(startDate: string, endDate: string): string {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!start || !end) return `${startDate} to ${endDate}`;
  return `${formatDatePart(start)} - ${formatDatePart(end)}`;
}

// ---- Company grouping helpers, shared by every sheet builder below ----

// A row's company label is its own subcontractor name if it has one,
// otherwise the real main company name (never the generic word "Main
// company" - the caller always passes the actual company name).
function companyLabelFor(
  subcontractorName: string | null | undefined,
  mainCompanyName: string
): string {
  return subcontractorName && subcontractorName.trim() ? subcontractorName : mainCompanyName;
}

// Sorts so the main company's rows come first, then each subcontractor's
// rows grouped together (alphabetically by company), with a caller-supplied
// secondary sort applied within each group.
function sortByCompanyThen<T>(
  items: T[],
  getCompany: (item: T) => string,
  mainCompanyName: string,
  secondary: (a: T, b: T) => number
): T[] {
  return items.slice().sort((a, b) => {
    const ca = getCompany(a);
    const cb = getCompany(b);
    if (ca !== cb) {
      if (ca === mainCompanyName) return -1;
      if (cb === mainCompanyName) return 1;
      return ca.localeCompare(cb);
    }
    return secondary(a, b);
  });
}

function addTitleRow(sheet: any, text: string, columnCount: number) {
  sheet.mergeCells(1, 1, 1, columnCount);
  const cell = sheet.getCell(1, 1);
  cell.value = text;
  cell.font = { bold: true, size: 13, color: { argb: "FF111827" } };
  cell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 26;
}

async function getExcelJS() {
  const mod = await import("exceljs/dist/exceljs.min.js");
  return (mod as any).default ?? mod;
}

async function fetchImageAsBuffer(
  url: string
): Promise<{ buffer: ArrayBuffer; extension: "jpeg" | "png" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    const extension = contentType.includes("png") ? "png" : "jpeg";
    const buffer = await res.arrayBuffer();
    return { buffer, extension };
  } catch (err) {
    console.error("Photo fetch error (embedding will show 'No photo' instead):", err);
    return null;
  }
}

function styleHeaderRow(row: any) {
  row.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  row.height = 20;
}

function styleDataRows(worksheet: any, headerRowNumber = 1) {
  worksheet.eachRow((row: any, rowNumber: number) => {
    if (rowNumber <= headerRowNumber) return;
    row.eachCell((cell: any) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFF3F4F6" } },
      };
      cell.alignment = { vertical: "middle" };
    });
  });
}

async function downloadWorkbook(workbook: any, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---- Reusable sheet builders, each adds one (or more) sheets to a given workbook ----

function addDetailSheet(
  workbook: any,
  sessions: SessionRecord[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const detailSheet = workbook.addWorksheet("Detail");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  detailSheet.columns = [
    { key: "employeeName", width: 24 },
    { key: "siteName", width: 22 },
    { key: "company", width: 22 },
    { key: "date", width: 14 },
    { key: "clockInTime", width: 14 },
    { key: "clockOutTime", width: 18 },
    { key: "hoursDisplay", width: 12 },
    { key: "breakDisplay", width: 12 },
  ];

  addTitleRow(detailSheet, `Detail: ${rangeLabel}`, 8);

  const headerRow = detailSheet.getRow(2);
  ["Employee", "Job Site", "Company", "Date", "Clock In", "Clock Out", "Hours", "Break"].forEach(
    (h, i) => (headerRow.getCell(i + 1).value = h)
  );
  styleHeaderRow(headerRow);

  const sorted = sortByCompanyThen(
    sessions,
    (s) => companyLabelFor(s.subcontractorName, companyName),
    companyName,
    (a, b) => (a.clockIn < b.clockIn ? -1 : 1)
  );

  let r = 3;
  sorted.forEach((s) => {
    const clockInDate = parseMaybeDate(s.clockIn);
    const clockOutDate = parseMaybeDate(s.clockOut);

    const dateLabel = clockInDate ? formatDatePart(clockInDate) : "-";
    const clockInLabel = clockInDate ? formatTimePart(clockInDate) : "-";

    let clockOutLabel = "Missing clock-out";
    if (clockOutDate) {
      clockOutLabel = formatTimePart(clockOutDate);
      if (
        clockInDate &&
        clockOutDate.toDateString() !== clockInDate.toDateString()
      ) {
        clockOutLabel += " (+1 day)";
      }
    }

    const row = detailSheet.getRow(r);
    row.getCell(1).value = s.employeeName;
    row.getCell(2).value = s.siteName;
    row.getCell(3).value = companyLabelFor(s.subcontractorName, companyName);
    row.getCell(4).value = dateLabel;
    row.getCell(5).value = clockInLabel;
    row.getCell(6).value = clockOutLabel;
    row.getCell(7).value = formatHoursMinutes(s.hours);
    row.getCell(8).value = formatHoursMinutes(s.breakHours);
    r += 1;
  });

  styleDataRows(detailSheet, 2);
  detailSheet.views = [{ state: "frozen", ySplit: 2 }];
}

function addNotesSheet(
  workbook: any,
  shiftNotes: ShiftNote[],
  startDate: string,
  endDate: string
) {
  const sheet = workbook.addWorksheet("Notes");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  sheet.columns = [
    { key: "date", width: 18 },
    { key: "siteName", width: 20 },
    { key: "note", width: 50 },
    { key: "createdByName", width: 22 },
  ];

  addTitleRow(sheet, `Notes: ${rangeLabel}`, 4);

  const headerRow = sheet.getRow(2);
  ["Date", "Site", "Note", "Written By"].forEach((h, i) => (headerRow.getCell(i + 1).value = h));
  styleHeaderRow(headerRow);

  let r = 3;
  shiftNotes.forEach((n) => {
    const row = sheet.getRow(r);
    row.getCell(1).value = n.timestamp ? n.timestamp.toDate().toLocaleString() : "-";
    row.getCell(2).value = n.siteName;
    row.getCell(3).value = n.note;
    row.getCell(4).value = n.createdByName;
    row.getCell(3).alignment = { wrapText: true, vertical: "middle" };
    r += 1;
  });

  styleDataRows(sheet, 2);
  sheet.views = [{ state: "frozen", ySplit: 2 }];
}

function addSummarySheet(
  workbook: any,
  summaries: EmployeeSummary[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const summarySheet = workbook.addWorksheet("Summary");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  summarySheet.columns = [
    { key: "employeeName", width: 26 },
    { key: "totalHours", width: 16 },
    { key: "totalBreakHours", width: 16 },
    { key: "company", width: 22 },
  ];

  const groups = new Map<string, EmployeeSummary[]>();
  summaries.forEach((s) => {
    const label = companyLabelFor(s.subcontractorName, companyName);
    const list = groups.get(label) ?? [];
    list.push(s);
    groups.set(label, list);
  });

  const orderedLabels = Array.from(groups.keys()).sort((a, b) => {
    if (a === companyName) return -1;
    if (b === companyName) return 1;
    return a.localeCompare(b);
  });

  let r = 1;
  orderedLabels.forEach((label) => {
    const groupSummaries = groups
      .get(label)!
      .slice()
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    summarySheet.mergeCells(r, 1, r, 4);
    const titleCell = summarySheet.getCell(r, 1);
    titleCell.value = `${label}: ${rangeLabel}`;
    titleCell.font = { bold: true, size: 13, color: { argb: "FF111827" } };
    titleCell.alignment = { vertical: "middle" };
    summarySheet.getRow(r).height = 26;
    r += 1;

    const headerRow = summarySheet.getRow(r);
    headerRow.getCell(1).value = "Employee";
    headerRow.getCell(2).value = "Total Hours";
    headerRow.getCell(3).value = "Total Break Hrs";
    headerRow.getCell(4).value = "Company";
    styleHeaderRow(headerRow);
    r += 1;

    groupSummaries.forEach((s) => {
      const row = summarySheet.getRow(r);
      row.getCell(1).value = s.employeeName;
      row.getCell(2).value = formatHoursMinutes(s.totalHours);
      row.getCell(3).value = formatHoursMinutes(s.totalBreakHours);
      row.getCell(4).value = label;
      row.eachCell((cell: any) => {
        cell.border = { bottom: { style: "thin", color: { argb: "FFF3F4F6" } } };
        cell.alignment = { vertical: "middle" };
      });
      r += 1;
    });

    r += 1; // spacer row between company blocks
  });
}

async function addPhotosSheet(
  workbook: any,
  sessions: SessionRecord[],
  startDate: string,
  endDate: string
) {
  const photosSheet = workbook.addWorksheet("Photos");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);
  const THUMB_SIZE = 90;

  photosSheet.columns = [
    { key: "employeeName", width: 22 },
    { key: "date", width: 14 },
    { key: "clockInPhoto", width: 20 },
    { key: "clockOutPhoto", width: 20 },
  ];

  addTitleRow(photosSheet, `Photos: ${rangeLabel}`, 4);

  const headerRow = photosSheet.getRow(2);
  ["Employee", "Date", "Clock In", "Clock Out"].forEach(
    (h, i) => (headerRow.getCell(i + 1).value = h)
  );
  styleHeaderRow(headerRow);

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const rowNumber = i + 3;
    const clockInDate = parseMaybeDate(s.clockIn);
    const dateLabel = clockInDate ? formatDatePart(clockInDate) : "-";

    const row = photosSheet.getRow(rowNumber);
    row.getCell(1).value = s.employeeName;
    row.getCell(2).value = dateLabel;
    row.height = THUMB_SIZE * 0.78;
    row.getCell(1).alignment = { vertical: "middle" };
    row.getCell(2).alignment = { vertical: "middle" };

    if (s.clockInPhotoUrl) {
      const img = await fetchImageAsBuffer(s.clockInPhotoUrl);
      if (img) {
        const imageId = workbook.addImage({
          buffer: img.buffer,
          extension: img.extension,
        });
        photosSheet.addImage(imageId, {
          tl: { col: 2, row: rowNumber - 1 },
          ext: { width: THUMB_SIZE, height: THUMB_SIZE },
        });
      } else {
        row.getCell(3).value = "No photo";
      }
    } else {
      row.getCell(3).value = "No photo";
    }

    if (s.clockOutPhotoUrl) {
      const img = await fetchImageAsBuffer(s.clockOutPhotoUrl);
      if (img) {
        const imageId = workbook.addImage({
          buffer: img.buffer,
          extension: img.extension,
        });
        photosSheet.addImage(imageId, {
          tl: { col: 3, row: rowNumber - 1 },
          ext: { width: THUMB_SIZE, height: THUMB_SIZE },
        });
      } else {
        row.getCell(4).value = "No photo";
      }
    } else {
      row.getCell(4).value = "No photo";
    }
  }

  photosSheet.views = [{ state: "frozen", ySplit: 2 }];
}

function addEmployeesSheet(
  workbook: any,
  employeeRecords: EmployeeExportRecord[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const sheet = workbook.addWorksheet("Employees");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  sheet.columns = [
    { key: "name", width: 24 },
    { key: "jobTitle", width: 20 },
    { key: "hourlyRate", width: 14 },
    { key: "phone", width: 16 },
    { key: "siteNames", width: 26 },
    { key: "company", width: 22 },
    { key: "status", width: 12 },
  ];

  addTitleRow(sheet, `Employees: ${rangeLabel}`, 7);

  const headerRow = sheet.getRow(2);
  ["Name", "Job Title", "Hourly Rate", "Phone", "Job Sites", "Company", "Status"].forEach(
    (h, i) => (headerRow.getCell(i + 1).value = h)
  );
  styleHeaderRow(headerRow);

  const sorted = sortByCompanyThen(
    employeeRecords,
    (e) => companyLabelFor(e.subcontractorName, companyName),
    companyName,
    (a, b) => a.name.localeCompare(b.name)
  );

  let r = 3;
  sorted.forEach((e) => {
    const row = sheet.getRow(r);
    row.getCell(1).value = e.name;
    row.getCell(2).value = e.jobTitle || "-";
    row.getCell(3).value = e.hourlyRate ?? null;
    row.getCell(4).value = e.phone || "-";
    row.getCell(5).value = e.siteNames || "-";
    row.getCell(6).value = companyLabelFor(e.subcontractorName, companyName);
    row.getCell(7).value = e.active ? "Active" : "Inactive";
    r += 1;
  });

  styleDataRows(sheet, 2);
  sheet.getColumn(3).numFmt = '"$"#,##0.00';
  sheet.views = [{ state: "frozen", ySplit: 2 }];
}

// ---- Payroll: hidden Jobs lookup sheet + day-row flattening ----

function addJobsLookupSheet(workbook: any, jobs: Job[]): { count: number } | null {
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

type PayrollDayRow = {
  employeeName: string;
  dateLabel: string;
  hours: number;
  breakHours: number;
  defaultRate: number | null;
  defaultJobName: string | null;
  subcontractorName: string | null;
};

function buildDayRows(
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
function addPayrollSheet(
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

function addAttendanceSheet(
  workbook: any,
  attendanceRecords: AttendanceRecord[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const sheet = workbook.addWorksheet("Attendance");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  sheet.columns = [
    { key: "employeeName", width: 24 },
    { key: "date", width: 14 },
    { key: "arrivalTime", width: 14 },
    { key: "departureTime", width: 14 },
    { key: "breakDisplay", width: 12 },
    { key: "status", width: 12 },
    { key: "company", width: 22 },
  ];

  addTitleRow(sheet, `Attendance: ${rangeLabel}`, 7);

  const headerRow = sheet.getRow(2);
  ["Employee", "Date", "Arrival", "Departure", "Break", "Status", "Company"].forEach(
    (h, i) => (headerRow.getCell(i + 1).value = h)
  );
  styleHeaderRow(headerRow);

  const sorted = sortByCompanyThen(
    attendanceRecords,
    (a) => companyLabelFor(a.subcontractorName, companyName),
    companyName,
    (a, b) => (a.date < b.date ? -1 : 1)
  );

  let r = 3;
  sorted.forEach((a) => {
    const row = sheet.getRow(r);
    row.getCell(1).value = a.employeeName;
    row.getCell(2).value = a.date;
    row.getCell(3).value = a.arrivalTime ?? "-";
    row.getCell(4).value = a.departureTime ?? "-";
    row.getCell(5).value = formatHoursMinutes(a.breakHours);
    row.getCell(6).value = a.status;
    row.getCell(7).value = companyLabelFor(a.subcontractorName, companyName);
    r += 1;
  });

  styleDataRows(sheet, 2);
  sheet.views = [{ state: "frozen", ySplit: 2 }];
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