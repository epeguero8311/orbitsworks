import type {
  EmployeeSummary,
  SessionRecord,
  EmployeeExportRecord,
  AttendanceRecord,
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

export async function exportTimesheetsExcel(
  sessions: SessionRecord[],
  summaries: EmployeeSummary[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();

  // --- Detail sheet: one row per clock-in/clock-out pair, proof of what happened each day ---
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

  // --- Summary sheet: one row per employee, total hours for the selected range ---
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

  await downloadWorkbook(
    workbook,
    buildExportFilename(companyName, "Employees", "xlsx")
  );
}

export async function exportPayrollExcel(
  summaries: EmployeeSummary[],
  companyName: string,
  startDate: string,
  endDate: string
) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Payroll Hours");

  sheet.columns = [
    { header: "Employee", key: "employeeName", width: 24 },
    { header: "Total Hours", key: "totalHours", width: 14 },
    { header: "Sessions", key: "sessionCount", width: 12 },
    { header: "Open Sessions", key: "openSessions", width: 14 },
    { header: "Hourly Rate", key: "hourlyRate", width: 14 },
    { header: "Estimated Pay", key: "estimatedPay", width: 16 },
  ];

  summaries.forEach((s) => {
    sheet.addRow({
      employeeName: s.employeeName,
      totalHours: Number(s.totalHours.toFixed(2)),
      sessionCount: s.sessionCount,
      openSessions: s.openSessions,
      hourlyRate: s.hourlyRate,
      estimatedPay: s.estimatedPay,
    });
  });

  styleHeaderRow(sheet.getRow(1));
  styleDataRows(sheet);
  sheet.getColumn("hourlyRate").numFmt = '"$"#,##0.00';
  sheet.getColumn("estimatedPay").numFmt = '"$"#,##0.00';
  sheet.getColumn("totalHours").numFmt = "0.00";
  sheet.views = [{ state: "frozen", ySplit: 1 }];

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

  await downloadWorkbook(
    workbook,
    buildExportFilename(companyName, "Attendance", "xlsx", startDate, endDate)
  );
}
