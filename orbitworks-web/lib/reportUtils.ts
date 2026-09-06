import type {
  EmployeeSummary,
  SessionRecord,
  EmployeeExportRecord,
  AttendanceRecord,
} from "@/lib/types";

export const APPROVALS_CUTOVER_DATE = "2026-09-05";

export const COMPANY_TIMEZONE = "America/Chicago";

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

// ---- Payroll Hours ----
export function toPayrollCsv(
  summaries: EmployeeSummary[],
  startDate: string,
  endDate: string
) {
  const header = [
    "Employee",
    "Total Hours (decimal)",
    "Total Hours (h:m)",
    "Total Break Hrs (decimal)",
    "Completed Sessions",
    "Missing Clock-Outs",
    "Hourly Rate",
    "Estimated Pay",
  ];
  const rows = summaries.map((s) => [
    s.employeeName,
    s.totalHours.toFixed(2),
    formatHours(s.totalHours),
    s.totalBreakHours.toFixed(2),
    String(s.sessionCount),
    String(s.openSessions),
    s.hourlyRate != null ? s.hourlyRate.toFixed(2) : "",
    s.estimatedPay != null ? s.estimatedPay.toFixed(2) : "",
  ]);
  return [
    `Report period: ${startDate} to ${endDate}`,
    header.join(","),
    csvRows(rows),
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