import type { ClockEvent } from "@/lib/types";

export type DayAttendance = {
  label: string;
  count: number;
};

// Mirrors the alertType values functions/src/alerts.ts writes into
// companies/{companyId}/alerts (useServerAlerts.ts maps those docs into
// this shape) - kept here rather than moved wholesale to lib/types.ts
// since useAlertActions.ts/AlertsPanel.tsx already import it from this
// file and alertActions' resolved/ignored records key off AlertItem.key.
export type AlertItem = {
  key: string;
  alertType: "lateClockIn" | "earlyClockOut" | "breakTooLong" | "maxHours" | "overtime" | "missedClockOut";
  label: string;
  detail: string;
  employeeId: string;
  event?: ClockEvent;
};

// A correction (correctClockEvent) intentionally never touches the raw
// `timestamp` field - only `adjustedTimestamp`. Anything on this page that
// judges an employee's CURRENT status (who's active, who's on break, elapsed
// hours, alert day-checks) must use the effective time below, or a back-dated
// correction can silently desync the live view from reality. Raw `timestamp`
// stays reserved for Firestore query bounds only, matching the same
// intentional split used in useReports.ts.
export function effectiveTimestamp(event: ClockEvent) {
  return event.adjustedTimestamp ?? event.timestamp;
}

export function effectiveDate(event: ClockEvent): Date | null {
  const ts = effectiveTimestamp(event);
  return ts ? ts.toDate() : null;
}

export function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Formats accumulated worked ms as "Xh Ym" (or just "Ym" under an hour).
// Used for the "Employees clocked in" table and anywhere else that needs to
// show total worked time for the current shift with breaks excluded.
export function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / (1000 * 60)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export function dateKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// buildAlertItems (client-side computation of maxHours/missedClockOut/
// overtime/breakTooLong) was removed here - useServerAlerts.ts now reads
// the same server-generated alerts the mobile Alerts tab uses
// (functions/src/alerts.ts) instead of recomputing them in the browser.
