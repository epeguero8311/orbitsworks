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

function addDetailSheet(workbook: any, sessions: SessionRecord[]) {
  const detailSheet = workbook.addWorksheet("Detail");

  detailSheet.columns = [
    { header: "Employee", key: "employeeName", width: 24 },
    { header: "Job Site", key: "siteName", width: 22 },
    { header: "Date", key: "date", width: 14 },
    { header: "Clock In", key: "clockInTime", width: 14 },
    { header: "Clock Out", key: "clockOutTime", width: 18 },
    { header: "Hours", key: "hoursDisplay", width: 12 },
  ];

  sessions.forEach((s) => {
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

    detailSheet.addRow({
      employeeName: s.employeeName,
      siteName: s.siteName,
      date: dateLabel,
      clockInTime: clockInLabel,
      clockOutTime: clockOutLabel,
      hoursDisplay: formatHoursMinutes(s.hours),
    });
  });

  styleHeaderRow(detailSheet.getRow(1));
  styleDataRows(detailSheet);
  detailSheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addNotesSheet(workbook: any, shiftNotes: ShiftNote[]) {
  const sheet = workbook.addWorksheet("Notes");

  sheet.columns = [
    { header: "Date", key: "date", width: 18 },
    { header: "Site", key: "siteName", width: 20 },
    { header: "Note", key: "note", width: 50 },
    { header: "Written By", key: "createdByName", width: 22 },
  ];

  shiftNotes.forEach((n) => {
    const row = sheet.addRow({
      date: n.timestamp ? n.timestamp.toDate().toLocaleString() : "-",
      siteName: n.siteName,
      note: n.note,
      createdByName: n.createdByName,
    });
    row.getCell("note").alignment = { wrapText: true, vertical: "middle" };
  });

  styleHeaderRow(sheet.getRow(1));
  styleDataRows(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addSummarySheet(
  workbook: any,
  summaries: EmployeeSummary[],
  startDate: string,
  endDate: string
) {
  const summarySheet = workbook.addWorksheet("Summary");
  const rangeLabel = formatDateRangeLabel(startDate, endDate);

  summarySheet.columns = [
    { key: "employeeName", width: 26 },
    { key: "totalHours", width: 16 },
  ];

  summarySheet.mergeCells("A1:B1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = `Total hours: ${rangeLabel}`;
  titleCell.font = { bold: true, size: 13, color: { argb: "FF111827" } };
  titleCell.alignment = { vertical: "middle" };
  summarySheet.getRow(1).height = 26;

  const summaryHeaderRow = summarySheet.getRow(2);
  summaryHeaderRow.getCell(1).value = "Employee";
  summaryHeaderRow.getCell(2).value = "Total Hours";
  styleHeaderRow(summaryHeaderRow);

  summaries
    .slice()
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName))
    .forEach((s) => {
      summarySheet.addRow({
        employeeName: s.employeeName,
        totalHours: formatHoursMinutes(s.totalHours),
      });
    });

  styleDataRows(summarySheet, 2);
  summarySheet.views = [{ state: "frozen", ySplit: 2 }];
}

async function addPhotosSheet(workbook: any, sessions: SessionRecord[]) {
  const photosSheet = workbook.addWorksheet("Photos");
  const THUMB_SIZE = 90;

  photosSheet.columns = [
    { header: "Employee", key: "employeeName", width: 22 },
    { header: "Date", key: "date", width: 14 },
    { header: "Clock In", key: "clockInPhoto", width: 20 },
    { header: "Clock Out", key: "clockOutPhoto", width: 20 },
  ];
  styleHeaderRow(photosSheet.getRow(1));

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const rowNumber = i + 2;
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

  photosSheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addEmployeesSheet(workbook: any, employeeRecords: EmployeeExportRecord[]) {
  const sheet = workbook.addWorksheet("Employees");

  sheet.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Job Title", key: "jobTitle", width: 20 },
    { header: "Hourly Rate", key: "hourlyRate", width: 14 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Job Sites", key: "siteNames", width: 26 },
    { header: "Status", key: "status", width: 12 },
  ];

  employeeRecords.forEach((e) => {
    sheet.addRow({
      name: e.name,
      jobTitle: e.jobTitle || "-",
      hourlyRate: e.hourlyRate ?? null,
      phone: e.phone || "-",
      siteNames: e.siteNames || "-",
      status: e.active ? "Active" : "Inactive",
    });
  });

  styleHeaderRow(sheet.getRow(1));
  styleDataRows(sheet);
  sheet.getColumn("hourlyRate").numFmt = '"$"#,##0.00';
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
  defaultRate: number | null;
  defaultJobName: string | null;
};

function buildDayRows(
  summaries: EmployeeSummary[],
  hoursByEmployeeDay: Map<string, number>,
  employeeJobIdById: Map<string, string | null>,
  jobs: Job[]
): PayrollDayRow[] {
  const nameById = new Map(summaries.map((s) => [s.employeeId, s.employeeName]));
  const rateById = new Map(summaries.map((s) => [s.employeeId, s.hourlyRate]));
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
      defaultRate: rateById.get(employeeId) ?? null,
      defaultJobName,
    });
  }

  rows.sort((a, b) =>
    a.employeeName === b.employeeName
      ? (a.dateLabel < b.dateLabel ? -1 : 1)
      : a.employeeName.localeCompare(b.employeeName)
  );
  return rows;
}

function addPayrollSheet(
  workbook: any,
  summaries: EmployeeSummary[],
  jobs: Job[],
  dayRows: PayrollDayRow[]
) {
  const sheet = workbook.addWorksheet("Payroll Hours");
  sheet.columns = [
    { width: 24 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 3 },
    { width: 12 },
  ];

  const jobsInfo = addJobsLookupSheet(workbook, jobs);
  const hasJobs = jobsInfo != null;

  const summaryHeader = sheet.getRow(1);
  ["Employee", "Total Hours", "Sessions", "Open Sessions", "Hourly Rate", "Estimated Pay"].forEach(
    (h, i) => (summaryHeader.getCell(i + 1).value = h)
  );
  styleHeaderRow(summaryHeader);

  summaries.forEach((s, idx) => {
    const row = sheet.getRow(idx + 2);
    row.height = 20;
    row.getCell(1).value = s.employeeName;
    row.getCell(2).value = Number(s.totalHours.toFixed(2));
    row.getCell(2).numFmt = "0.00";
    row.getCell(3).value = s.sessionCount;
    row.getCell(4).value = s.openSessions;
    row.getCell(5).value = s.hourlyRate;
    row.getCell(5).numFmt = '"$"#,##0.00';
    row.getCell(6).numFmt = '"$"#,##0.00';
  });

  const summaryLastRow = summaries.length + 1;

  const dailyTitleRow = summaryLastRow + 3;
  sheet.mergeCells(dailyTitleRow, 1, dailyTitleRow, 6);
  const titleCell = sheet.getCell(dailyTitleRow, 1);
  titleCell.value = hasJobs
    ? "Daily Breakdown - pick a Job on any row to update that day's pay and the totals above"
    : "Daily Breakdown";
  titleCell.font = { bold: true, size: 12, color: { argb: "FF111827" } };
  sheet.getRow(dailyTitleRow).height = 26;

  const dailyHeaderRow = dailyTitleRow + 1;
  const dailyHeader = sheet.getRow(dailyHeaderRow);
  ["Employee", "Date", "Job", "Hourly Rate", "Hours", "Estimated Pay"].forEach(
    (h, i) => (dailyHeader.getCell(i + 1).value = h)
  );
  dailyHeader.getCell(8).value = "Default Rate";
  styleHeaderRow(dailyHeader);
  sheet.getColumn(8).hidden = true;

  let r = dailyHeaderRow + 1;
  let prevEmployee: string | null = null;

  dayRows.forEach((d) => {
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
    row.getCell(8).value = d.defaultRate;

    if (hasJobs) {
      row.getCell(4).value = {
        formula: `IF(OR(C${r}="",C${r}="(Default)"),H${r},VLOOKUP(C${r},JobsTable,2,FALSE))`,
      };
      row.getCell(3).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ["JobsList"],
      };
    } else {
      row.getCell(4).value = { formula: `H${r}` };
    }
    row.getCell(4).numFmt = '"$"#,##0.00';

    row.getCell(5).value = Number(d.hours.toFixed(2));
    row.getCell(5).numFmt = "0.00";

    row.getCell(6).value = { formula: `D${r}*E${r}` };
    row.getCell(6).numFmt = '"$"#,##0.00';

    r += 1;
  });

  const dailyFirstDataRow = dailyHeaderRow + 1;
  const dailyLastRow = r - 1;

  summaries.forEach((s, idx) => {
    const row = idx + 2;
    if (dayRows.length > 0) {
      sheet.getCell(row, 6).value = {
        formula: `SUMIF(A${dailyFirstDataRow}:A${dailyLastRow},A${row},F${dailyFirstDataRow}:F${dailyLastRow})`,
      };
    } else {
      sheet.getCell(row, 6).value = s.estimatedPay;
    }
  });

  styleDataRows(sheet, 1);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addAttendanceSheet(workbook: any, attendanceRecords: AttendanceRecord[]) {
  const sheet = workbook.addWorksheet("Attendance");

  sheet.columns = [
    { header: "Employee", key: "employeeName", width: 24 },
    { header: "Date", key: "date", width: 14 },
    { header: "Arrival", key: "arrivalTime", width: 14 },
    { header: "Departure", key: "departureTime", width: 14 },
    { header: "Status", key: "status", width: 12 },
  ];

  attendanceRecords.forEach((a) => {
    sheet.addRow({
      employeeName: a.employeeName,
      date: a.date,
      arrivalTime: a.arrivalTime ?? "-",
      departureTime: a.departureTime ?? "-",
      status: a.status,
    });
  });

  styleHeaderRow(sheet.getRow(1));
  styleDataRows(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

// ---- Standalone per-report exports (unchanged behavior, each its own file) ----

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

  addSummarySheet(workbook, summaries, startDate, endDate);
  addDetailSheet(workbook, sessions);
  addNotesSheet(workbook, shiftNotes);
  await addPhotosSheet(workbook, sessions);

  await downloadWorkbook(
    workbook,
    buildExportFilename(companyName, "Timesheets", "xlsx", startDate, endDate)
  );
}

export async function exportEmployeesExcel(
  employeeRecords: EmployeeExportRecord[],
  companyName: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  addEmployeesSheet(workbook, employeeRecords);

  await downloadWorkbook(
    workbook,
    buildExportFilename(companyName, "Employees", "xlsx")
  );
}

export async function exportPayrollExcel(
  summaries: EmployeeSummary[],
  jobs: Job[],
  hoursByEmployeeDay: Map<string, number>,
  employeeJobIdById: Map<string, string | null>,
  companyName: string,
  startDate: string,
  endDate: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  const dayRows = buildDayRows(summaries, hoursByEmployeeDay, employeeJobIdById, jobs);
  addPayrollSheet(workbook, summaries, jobs, dayRows);

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

  addAttendanceSheet(workbook, attendanceRecords);

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
  employeeJobIdById: Map<string, string | null>,
  companyName: string,
  startDate: string,
  endDate: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  addSummarySheet(workbook, summaries, startDate, endDate);
  addDetailSheet(workbook, sessions);
  addNotesSheet(workbook, shiftNotes);
  await addPhotosSheet(workbook, sessions);
  addEmployeesSheet(workbook, employeeRecords);

  const dayRows = buildDayRows(summaries, hoursByEmployeeDay, employeeJobIdById, jobs);
  addPayrollSheet(workbook, summaries, jobs, dayRows);

  addAttendanceSheet(workbook, attendanceRecords);

  await downloadWorkbook(
    workbook,
    buildExportFilename(companyName, "FullReport", "xlsx", startDate, endDate)
  );
}