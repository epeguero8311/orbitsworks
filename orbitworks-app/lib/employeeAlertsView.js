// Employee App Phase 7 - what the Alerts tab shows, with no React Native,
// Expo or Firebase imports so test/employeeAlertsView.test.js runs it under
// `node --test`. Server alerts (companies/{c}/employeeAlerts, the
// employee's own only) merged with the break reminders this phone already
// showed (lib/breakReminders.js), newest first, at most ALERTS_TAB_LIMIT.
// Read only - nothing here is ever written back.

const ALERTS_TAB_LIMIT = 50;

const SERVER_TITLES = {
  shiftEnding: "Shift ending soon",
  stillClockedIn: "Still clocked in",
  maxHours: "Max hours",
  overtime: "Overtime",
  // Phase 8 - written when a "left the job site" syncs (no push).
  leftSite: "You have left the job site",
  // 2026-11-06 - no face found in the photo of one of their own punches.
  faceNoFace: "Couldn't detect a face",
};

function toMs(value) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return null;
}

// A Firestore employeeAlerts doc -> a row. createdAt is null for a moment
// right after the write (server time not back yet): shown as "now".
function serverAlertRow(id, data, nowMs) {
  const d = data || {};
  return {
    id: `server:${id}`,
    source: "server",
    alertType: d.alertType || "",
    title: d.title || SERVER_TITLES[d.alertType] || "Alert",
    message: d.message || "",
    reason: d.reason || "",
    atMs: toMs(d.createdAt) ?? nowMs,
  };
}

// A fired break reminder from the phone's log -> a row.
function reminderRow(entry) {
  return {
    id: `local:${entry.id}`,
    source: "phone",
    alertType: `break:${entry.kind}`,
    title: entry.title,
    message: entry.body,
    reason: entry.reason || "",
    atMs: entry.atMs,
  };
}

function mergeAlerts(serverRows, reminderRows, limit = ALERTS_TAB_LIMIT) {
  return [...(serverRows || []), ...(reminderRows || [])]
    .filter((r) => r && typeof r.atMs === "number")
    .sort((a, b) => b.atMs - a.atMs || (a.id < b.id ? -1 : 1))
    .slice(0, limit);
}

function zonedDayKey(ms, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

// "4:30 PM" today, "Nov 3, 4:30 PM" on another day (company time zone).
function alertTimeLabel(atMs, nowMs, timeZone) {
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(atMs));
  if (zonedDayKey(atMs, timeZone) === zonedDayKey(nowMs, timeZone)) return time;
  const day = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(new Date(atMs));
  return `${day}, ${time}`;
}

module.exports = { ALERTS_TAB_LIMIT, serverAlertRow, reminderRow, mergeAlerts, alertTimeLabel };
