import type { ClockEvent, EmployeeUpdate } from "@/lib/types";

// How far back an ignored/resolved alertAction stays remembered - see
// useAlertActions.ts's resolvedAt query.
export const ALERT_ACTION_LOOKBACK_DAYS = 30;

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
  // Every alert type is server-generated now (functions/src/alerts.ts,
  // via useServerAlerts.ts).
  alertType:
    | "lateClockIn"
    | "earlyClockOut"
    | "breakTooLong"
    | "maxHours"
    | "overtime"
    | "missedClockOut"
    | "clockedInOutsideGeofence"
    | "siteMismatch"
    // Face Verification (Pro) - see functions/src/alerts.ts.
    | "faceMismatch"
    | "faceNoFace"
    | "faceBadReference"
    // Update Employee (mobile) - see functions/src/alerts.ts.
    | "employeeUpdated";
  // Who/what this alert is about - an employee name for every alert type
  // today. A future site-level alert (no single employee involved) should
  // put the site name (or "All Sites") here instead - alertTitle() below
  // just formats whatever ends up in this field, no special-casing needed.
  label: string;
  detail: string;
  employeeId: string;
  event?: ClockEvent;
  // Set for server-generated alerts (useServerAlerts.ts). clockedInOutsideGeofence/
  // siteMismatch are both about a specific past clock-in, not an
  // employee's current session, so AlertsPanel.tsx resolves `event` by
  // this id instead of by employeeId for those two - a since-clocked-out
  // or re-clocked-in employee must not attach the wrong session to an
  // "Edit Time" action.
  eventId?: string | null;
  // Update Employee (mobile). employeeUpdated's own per-instance severity
  // (red for a different-person photo swap, yellow otherwise) - read off
  // the alert doc itself (useServerAlerts.ts), unlike every other type
  // whose severity is the fixed ALERT_SEVERITY[alertType] below.
  severity?: AlertSeverity;
  employeeUpdateId?: string | null;
  employeeUpdate?: EmployeeUpdate;
};

// Short tag shown after the "-" in an alert's title, e.g. "Ryan Mitchell -
// Overtime". Keep these short - they render inline next to a name/site.
export const ALERT_SHORT_TAGS: Record<AlertItem["alertType"], string> = {
  maxHours: "Max Hours",
  missedClockOut: "Missed Clock Out",
  overtime: "Overtime",
  breakTooLong: "Long Break",
  lateClockIn: "Late Clock In",
  earlyClockOut: "Early Clock Out",
  clockedInOutsideGeofence: "Outside Geofence",
  siteMismatch: "Wrong Site",
  faceMismatch: "Face Mismatch",
  faceNoFace: "No Face Detected",
  faceBadReference: "Bad Reference Photo",
  employeeUpdated: "Employee Updated",
};

// Drives the severity dot in AlertsPanel - urgent (red) for alerts that need
// attention right away, warning (amber) for threshold breaches that should
// be reviewed, and info (blue) for alerts that never block anything and are
// purely a "someone should take a look" flag (see siteMismatch's comment
// below).
export type AlertSeverity = "urgent" | "warning" | "info";

export const ALERT_SEVERITY: Record<AlertItem["alertType"], AlertSeverity> = {
  maxHours: "urgent",
  missedClockOut: "urgent",
  overtime: "warning",
  breakTooLong: "warning",
  lateClockIn: "warning",
  earlyClockOut: "warning",
  clockedInOutsideGeofence: "warning",
  siteMismatch: "info",
  // Never block a clock event, same reasoning as clockedInOutsideGeofence -
  // "someone should take a look," one notch below urgent.
  faceMismatch: "warning",
  faceNoFace: "warning",
  faceBadReference: "warning",
  // Static fallback only - AlertsPanel.tsx prefers the per-doc `severity`
  // field for this type (set per-instance by createEmployeeUpdatedAlert),
  // falling back to this only if that field is somehow missing.
  employeeUpdated: "warning",
};

export function alertTitle(alert: AlertItem) {
  return `${alert.label} - ${ALERT_SHORT_TAGS[alert.alertType]}`;
}

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

