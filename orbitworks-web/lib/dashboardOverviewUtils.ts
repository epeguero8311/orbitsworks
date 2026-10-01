import type { CompanySettings } from "@/lib/hooks/useCompanySettings";
import type { ClockEvent } from "@/lib/types";
import { formatGeofenceDistance } from "@/lib/geo";

// How far back an ignored/resolved alertAction stays remembered (see
// useAlertActions.ts's resolvedAt query) - shared here so
// buildGeofenceAlertItems can bound its own event-scoped alerts (geofence)
// to the same window and never resurrect one whose action fell outside
// that lookback.
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
  // lateClockIn/earlyClockOut/breakTooLong/maxHours/overtime/missedClockOut
  // are server-generated (functions/src/alerts.ts, via useServerAlerts.ts).
  // clockedInOutsideGeofence/siteMismatch are still computed client-side by
  // buildGeofenceAlertItems below - alerts.ts's ALERT_TYPES comment notes
  // geofence data "doesn't exist on main yet" and to extend the server set
  // once it lands; until that migration happens, these two stay separate.
  alertType:
    | "lateClockIn"
    | "earlyClockOut"
    | "breakTooLong"
    | "maxHours"
    | "overtime"
    | "missedClockOut"
    | "clockedInOutsideGeofence"
    | "siteMismatch";
  // Who/what this alert is about - an employee name for every alert type
  // today. A future site-level alert (no single employee involved) should
  // put the site name (or "All Sites") here instead - alertTitle() below
  // just formats whatever ends up in this field, no special-casing needed.
  label: string;
  detail: string;
  employeeId: string;
  event?: ClockEvent;
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

// Client-computed companion to useServerAlerts.ts - only the two
// geofencing-specific alert types, which functions/src/alerts.ts's
// ALERT_TYPES comment explicitly defers ("geofence data doesn't exist on
// main yet... extend this list when geofence data lands"). Every other
// alert type (maxHours/missedClockOut/overtime/breakTooLong/lateClockIn/
// earlyClockOut) is now server-generated; AlertsPanel.tsx merges this
// function's output with useServerAlerts()'s.
export function buildGeofenceAlertItems({
  settings,
  isPro,
  recentEvents,
}: {
  settings: CompanySettings;
  isPro: boolean;
  recentEvents?: ClockEvent[];
}): AlertItem[] {
  const alertItems: AlertItem[] = [];
  const now = new Date();

  // Geofencing (Pro) Part 4. Unlike every alert above, this one is about a
  // specific past moment (the clock-in), not current state - so it's keyed
  // by event id (not day/week) and bounded to the same lookback window
  // useAlertActions.ts remembers resolutions for, so an ignored/resolved
  // alert can never resurrect itself once its action ages out of that
  // window. Fires for every mode (flag/requireReason/block) and for
  // overrides alike - only geofenceStatus and type matter here, not
  // source or enforcement mode. Clock-outs are excluded (type === "in"
  // only) - they're never more than the badge in the log, per spec.
  if (isPro && settings.alerts.clockedInOutsideGeofence && recentEvents) {
    const cutoffMs = now.getTime() - ALERT_ACTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    recentEvents
      .filter((event) => event.type === "in" && event.geofenceStatus === "outside")
      .forEach((event) => {
        const d = effectiveDate(event);
        if (!d || d.getTime() < cutoffMs) return;

        const distancePhrase =
          event.distanceFromSiteM != null ? formatGeofenceDistance(event.distanceFromSiteM) : null;
        const detail = distancePhrase
          ? `Clocked in ${distancePhrase} from ${event.siteName}${event.reason ? ` - Reason: ${event.reason}` : ""}`
          : `Clocked in outside the geofence at ${event.siteName}${event.reason ? ` - Reason: ${event.reason}` : ""}`;

        alertItems.push({
          key: `geofence-${event.id}`,
          alertType: "clockedInOutsideGeofence",
          label: event.employeeName,
          detail,
          employeeId: event.employeeId,
          event,
        });
      });
  }

  // Auto site detection - siteMismatch is only ever set on a clock-in
  // (functions/src/clockEvents.ts), and only when the employee has their
  // own assignedSiteIds and the detected site isn't one of them. Same
  // event-scoped/lookback shape as the geofence alert above - info-only,
  // never blocks, so this is purely a "someone should take a look" flag.
  if (isPro && settings.alerts.siteMismatchWarning && recentEvents) {
    const cutoffMs = now.getTime() - ALERT_ACTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    recentEvents
      .filter((event) => event.type === "in" && event.siteMismatch === true)
      .forEach((event) => {
        const d = effectiveDate(event);
        if (!d || d.getTime() < cutoffMs) return;

        alertItems.push({
          key: `mismatch-${event.id}`,
          alertType: "siteMismatch",
          label: event.employeeName,
          detail: `Clocked in at ${event.siteName || "an unassigned site"} - not one of their assigned sites.`,
          employeeId: event.employeeId,
          event,
        });
      });
  }

  return alertItems;
}
