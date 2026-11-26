import { overtimeDayKey, overtimeWeekKey } from "@/lib/overtime";
import { showHours } from "@/lib/hoursDisplay";
import type {
  EmployeeSummary,
  SessionRecord,
  EmployeeExportRecord,
  AttendanceRecord,
} from "@/lib/types";
import type { DailyBreakdownRow, EmployeeRoundedTotal } from "@/lib/reportDailyBreakdown";
import type { OvertimeReportRow, OvertimeEmployeeTotal } from "@/lib/reportOvertime";
import { HOURS_COLUMNS, MIXED_RATE_LABEL } from "@/lib/hoursColumns";

export const APPROVALS_CUTOVER_DATE = "2026-09-06";

// Same IANA zone as functions/src/index.ts's localDateKey - keep these two
// in sync, they must agree on which calendar day an event falls on.
export const COMPANY_TIMEZONE = "America/Chicago";

// Canonical "what calendar day is this" for anything that has to agree
// with the timesheetApprovals.date field the Cloud Function writes.
// dateKey() below is UTC-based and disagrees with the server's
// Chicago-anchored date for any evening event (roughly 6pm-midnight
// local), which can make an approved session silently fall outside the
// gating query's date range and get excluded from an export. Always use
// this one for approvals-related date comparisons.
export function localDateKey(d: Date, timeZone: string = COMPANY_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

export function formatHours(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

export function formatMinutesAsTime(totalMinutes: number | null): string {
  if (totalMinutes == null) return "-";
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = Math.round(totalMinutes % 60);
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

// Reports page default range: this week (Monday start, as before) to
// today, both in the company time zone - the same day key the reports
// group shifts by (overtimeDayKey). It used to be the UTC date, so after
// ~6pm Chicago "today" was already tomorrow.
export function defaultReportRange(timeZone: string, nowMs: number = Date.now()): { start: string; end: string } {
  const today = overtimeDayKey(nowMs, timeZone);
  return { start: overtimeWeekKey(today, 1), end: today };
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function csvRows(rows: string[][]): string {
  return rows.map((r) => r.map((cell) => `"${cell}"`).join(",")).join("\n");
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Tips (Task 3): with the Tips toggle ON, a Tips column goes right before
// Est. Pay (always the last column of these payroll tables). OFF = the row
// unchanged.
function withTipsBeforePay(cells: string[], tips: string, tipsEnabled: boolean): string[] {
  if (!tipsEnabled) return cells;
  return [...cells.slice(0, -1), tips, cells[cells.length - 1]];
}

// ---- Payroll Hours ----
// dailyRows/roundedTotalsByEmployee come from the same
// lib/reportDailyBreakdown.ts builder that feeds the on-screen Daily
// Breakdown, so the summary pay here and the daily block below both match
// what's shown on the Reports page - there's no second calculation path.
export function toPayrollCsv(
  summaries: EmployeeSummary[],
  startDate: string,
  endDate: string,
  dailyRows: DailyBreakdownRow[],
  roundedTotalsByEmployee: Map<string, EmployeeRoundedTotal>,
  tipsEnabled = false
) {
  // Hours column names (Nov 25): same numbers, new labels.
  const header = [
    "Employee",
    `${HOURS_COLUMNS.shift.label} (decimal)`,
    `${HOURS_COLUMNS.shift.label} (h:m)`,
    `${HOURS_COLUMNS.break.label} (decimal)`,
    "Completed Sessions",
    "Missing Clock-Outs",
    "Hourly Rate",
    "Estimated Pay (Excluding Break)",
  ];
  const rows = summaries.map((s) => {
    const roundedTotal = roundedTotalsByEmployee.get(s.employeeId);
    const estimatedPay = roundedTotal?.totalPay ?? s.estimatedPay;
    const tips = roundedTotal?.totalTips ?? s.tips ?? 0;
    // Shown hours: sums of the shown day rows below (lib/hoursDisplay.ts).
    const shiftHours = roundedTotal?.hours.shift ?? s.totalHours;
    const breakHours = roundedTotal?.hours.brk ?? s.totalBreakHours;
    return withTipsBeforePay([
      s.employeeName,
      showHours(shiftHours),
      formatHours(shiftHours),
      showHours(breakHours),
      String(s.sessionCount),
      String(s.openSessions),
      s.hourlyRate != null ? s.hourlyRate.toFixed(2) : "",
      estimatedPay != null ? estimatedPay.toFixed(2) : "",
    ], tips.toFixed(2), tipsEnabled);
  });

  const dailyHeader = [
    "Employee",
    "Date",
    "Job",
    "Hourly Rate",
    HOURS_COLUMNS.shift.label,
    HOURS_COLUMNS.break.label,
    HOURS_COLUMNS.worked.label,
    "Estimated Pay",
  ];
  const dailyRowsOut = dailyRows.map((d) =>
    withTipsBeforePay(
      [
        d.employeeName,
        d.date,
        d.jobLabel,
        d.rate != null ? d.rate.toFixed(2) : "",
        showHours(d.hours.shift),
        showHours(d.hours.brk),
        showHours(d.hours.worked),
        d.pay != null ? d.pay.toFixed(2) : "",
      ],
      (d.tips ?? 0).toFixed(2),
      tipsEnabled
    )
  );

  return [
    `Report period: ${startDate} to ${endDate}`,
    withTipsBeforePay(header, "Tips", tipsEnabled).join(","),
    csvRows(rows),
    "",
    "Daily Breakdown",
    withTipsBeforePay(dailyHeader, "Tips", tipsEnabled).join(","),
    csvRows(dailyRowsOut),
  ].join("\n");
}

// Overtime (Task 1): Payroll CSV with the Overtime toggle ON - same layout
// as toPayrollCsv plus an Overtime column in both tables, Est. pay with OT
// pay, and a day with 2+ jobs split into job rows + a "Day total" row.
export function toPayrollCsvWithOvertime(
  summaries: EmployeeSummary[],
  startDate: string,
  endDate: string,
  overtimeRows: OvertimeReportRow[],
  overtimeTotals: Map<string, OvertimeEmployeeTotal>,
  tipsEnabled = false
) {
  // Hours columns (Nov 25): Shift Hours | Break | Regular Hours | Overtime |
  // Total Worked, Regular = Total Worked - Overtime. Hourly Rate = "Mixed"
  // for an employee who worked 2+ jobs in the period.
  const jobsByEmployee = new Map<string, Set<string>>();
  for (const d of overtimeRows) {
    if (d.kind === "total") continue;
    const set = jobsByEmployee.get(d.employeeId) ?? new Set<string>();
    set.add(d.jobId ?? "(default)");
    jobsByEmployee.set(d.employeeId, set);
  }
  const header = [
    "Employee",
    `${HOURS_COLUMNS.shift.label} (decimal)`,
    `${HOURS_COLUMNS.shift.label} (h:m)`,
    `${HOURS_COLUMNS.break.label} (decimal)`,
    `${HOURS_COLUMNS.regular.label} (decimal)`,
    `${HOURS_COLUMNS.overtime.label} (decimal)`,
    `${HOURS_COLUMNS.worked.label} (decimal)`,
    "Completed Sessions",
    "Missing Clock-Outs",
    "Hourly Rate",
    "Estimated Pay (Excluding Break)",
  ];
  const rows = summaries.map((s) => {
    const total = overtimeTotals.get(s.employeeId);
    const mixed = (jobsByEmployee.get(s.employeeId)?.size ?? 0) >= 2;
    // Shown hours: sums of the shown day rows (lib/hoursDisplay.ts).
    const h = total?.hours ?? { shift: 0, brk: 0, regular: 0, overtime: 0, worked: 0 };
    return withTipsBeforePay([
      s.employeeName,
      showHours(h.shift),
      formatHours(h.shift),
      showHours(h.brk),
      showHours(h.regular),
      showHours(h.overtime),
      showHours(h.worked),
      String(s.sessionCount),
      String(s.openSessions),
      mixed ? MIXED_RATE_LABEL : s.hourlyRate != null ? s.hourlyRate.toFixed(2) : "",
      total?.totalPay != null ? total.totalPay.toFixed(2) : "",
    ], (total?.totalTips ?? 0).toFixed(2), tipsEnabled);
  });

  const dailyHeader = [
    "Employee",
    "Date",
    "Job",
    "Hourly Rate",
    HOURS_COLUMNS.shift.label,
    HOURS_COLUMNS.break.label,
    HOURS_COLUMNS.regular.label,
    HOURS_COLUMNS.overtime.label,
    HOURS_COLUMNS.worked.label,
    "Estimated Pay",
  ];
  const dailyRowsOut = overtimeRows.map((d) =>
    withTipsBeforePay(
      [
        d.employeeName,
        d.date,
        d.jobLabel,
        d.rate != null ? d.rate.toFixed(2) : "",
        showHours(d.hours.shift),
        showHours(d.hours.brk),
        showHours(d.hours.regular),
        showHours(d.hours.overtime),
        showHours(d.hours.worked),
        d.pay != null ? d.pay.toFixed(2) : "",
      ],
      (d.tips ?? 0).toFixed(2),
      tipsEnabled
    )
  );

  return [
    `Report period: ${startDate} to ${endDate}`,
    withTipsBeforePay(header, "Tips", tipsEnabled).join(","),
    csvRows(rows),
    "",
    "Daily Breakdown",
    withTipsBeforePay(dailyHeader, "Tips", tipsEnabled).join(","),
    csvRows(dailyRowsOut),
  ].join("\n");
}

// ---- Timesheets (per-session detail) ----
export function toTimesheetsCsv(
  sessions: SessionRecord[],
  startDate: string,
  endDate: string
) {
  const header = ["Employee", "Job Site", "Clock In", "Clock Out", "Hours", "Break Hours"];
  const rows = sessions.map((s) => [
    s.employeeName,
    s.siteName || "-",
    formatDateTime(s.clockIn),
    s.clockOut ? formatDateTime(s.clockOut) : "MISSING",
    s.hours != null ? s.hours.toFixed(2) : "",
    s.breakHours != null ? s.breakHours.toFixed(2) : "0",
  ]);
  return [
    `Report period: ${startDate} to ${endDate}`,
    header.join(","),
    csvRows(rows),
  ].join("\n");
}

// ---- Employees (full roster, not date-scoped) ----
export function toEmployeesCsv(employees: EmployeeExportRecord[]) {
  const header = [
    "Name",
    "Job Title",
    "Hourly Rate",
    "Phone",
    "Active",
    "Assigned Sites",
  ];
  const rows = employees.map((e) => [
    e.name,
    e.jobTitle,
    e.hourlyRate != null ? e.hourlyRate.toFixed(2) : "",
    e.phone,
    e.active ? "Yes" : "No",
    e.siteNames,
  ]);
  return [header.join(","), csvRows(rows)].join("\n");
}

// ---- Attendance ----
export function toAttendanceCsv(
  records: AttendanceRecord[],
  startDate: string,
  endDate: string
) {
  const header = ["Employee", "Date", "Arrival", "Departure", "Break Hours", "Status"];
  const rows = records.map((r) => [
    r.employeeName,
    r.date,
    r.arrivalTime ?? "",
    r.departureTime ?? "",
    r.breakHours != null ? r.breakHours.toFixed(2) : "0",
    r.status,
  ]);
  return [
    `Report period: ${startDate} to ${endDate}`,
    header.join(","),
    csvRows(rows),
  ].join("\n");
}