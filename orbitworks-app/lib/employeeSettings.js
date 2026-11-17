// Employee App Phase 5 - what the Settings tab shows (decided 2026-11-03,
// Settings 14-20; Phase 10 A1), with no React Native, Expo or Firebase
// imports so test/employeeSettings.test.js can run it under `node --test`
// (same pattern as historyDays.js).
//   - email: the one they signed in with (the login's), else the self view's
//   - photo, name, birthday: the employee's own self view (employeeSelfViews,
//     server-written, no PIN / rate / face)
//   - PIN: shown plainly from the copy saved on the phone (lib/savedPin.js,
//     useSavedPin.js - D1 revised 2026-11-06)
//   - company: the company the account is under - the parent company,
//     never the subcontractor (useEmployeeAppConfig)
//   - Update: the first 8 characters of the OTA update id, or "Built-in"
// Phase 10 (A1): no Subcontractor, Job site or Location access rows.
// Everything is view only. The Notifications and Location switches mirror
// the phone's own permission (permissionToggleAction); no push token.

const { pendingSiteExitCount } = require("./siteExitLogic");
const { badgeCount, foldQueuedEvents } = require("./punchQueueLogic");
const { deriveHomeState } = require("./employeeHome");
const { PIN_NOT_LOADED } = require("./savedPin");

const NOT_SET = "Not set";
const BUILT_IN = "Built-in";
const UPDATE_ID_CHARS = 8;

// "1990-01-31" -> "January 31, 1990" (formatted in UTC so the day never
// shifts). Missing or not a real date -> "Not set".
function formatBirthday(dob) {
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return NOT_SET;
  const [y, m, d] = dob.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return NOT_SET;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(date);
}

function textOr(value, fallback) {
  return typeof value === "string" && value !== "" ? value : fallback;
}

// update = { updateId, isEmbeddedLaunch } from expo-updates. The bundle
// inside the build (no OTA update running) is "Built-in".
function updateLabel(update) {
  if (!update || update.isEmbeddedLaunch || typeof update.updateId !== "string" || !update.updateId) return BUILT_IN;
  return update.updateId.slice(0, UPDATE_ID_CHARS);
}

// The rows Settings shows. Only these fields - nothing else from the self
// view is ever passed on. loginEmail = the signed-in login's email.
function buildSettingsInfo({ view, companyName, update, loginEmail }) {
  const v = view || {};
  return {
    photoUrl: textOr(v.photoUrl, null),
    name: textOr(v.name, ""),
    email: textOr(loginEmail, textOr(v.email, NOT_SET)),
    birthday: formatBirthday(v.dob),
    company: textOr(companyName, ""),
    update: updateLabel(update),
  };
}

// The Settings tab's view-only rows under the photo and name, in order:
// [label, value]. info = buildSettingsInfo(...), pinText = savedPinText(...)
// (lib/savedPin.js).
function settingsRows(info, pinText = PIN_NOT_LOADED) {
  return [
    ["Email", info.email],
    ["PIN", pinText],
    ["Birthday", info.birthday],
    ["Company", info.company],
  ];
}

// A Notifications or Location switch tap. wantOn = the new switch value,
// permission = { status, canAskAgain } from the phone. The phone's
// permission IS the switch (same flow as locationPermission.js and the
// supervisor Settings handleToggleLocation):
//   "ask"          - never asked: show why, then the phone's own prompt
//   "openSettings" - only the phone's Settings app can change it now
//   "none"         - nothing to do (already so, or the phone won't ask)
function permissionToggleAction(wantOn, permission) {
  const status = permission && permission.status;
  const canAskAgain = !!(permission && permission.canAskAgain);
  if (!wantOn) return status === "granted" ? "openSettings" : "none";
  if (status === "granted") return "none";
  if (status === "undetermined" && canAskAgain) return "ask";
  if (status === "denied" && !canAskAgain) return "openSettings";
  return "none";
}

// Log out warning: punches and comments still on the phone (they stay,
// and sync only when this employee signs back in). null = none waiting.
//   (2, 1) -> "2 punches and 1 comment are not synced yet"
// What the Log out warning counts: every punch and comment of this
// employee still on the phone (Waiting, Syncing or Not synced), with no
// 10-second delay - unlike the Sync tab badge, a punch saved a second ago
// counts. punches / comments = the hooks' `all` lists.
// Phase 8: siteExits = the leave tracking rows (site_exit_queue) - a
// "left the job site" or "tracking off" still waiting counts too.
function logoutCounts(punches, comments, companyId, employeeId, siteExits) {
  return {
    punches: badgeCount(punches, companyId, employeeId),
    comments: badgeCount(comments, companyId, employeeId),
    siteExits: pendingSiteExitCount(siteExits || [], companyId, employeeId),
  };
}

// "2 punches and 1 comment" + the count, or null when nothing is waiting.
function waitingList(punches, comments, siteExits) {
  const p = punches > 0 ? punches : 0;
  const c = comments > 0 ? comments : 0;
  const x = siteExits > 0 ? siteExits : 0;
  if (p + c + x === 0) return null;
  const parts = [];
  if (p) parts.push(`${p} punch${p === 1 ? "" : "es"}`);
  if (c) parts.push(`${c} comment${c === 1 ? "" : "s"}`);
  if (x) parts.push(`${x} job site record${x === 1 ? "" : "s"}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return { list, total: p + c + x };
}

function logoutWarning(punches, comments, siteExits) {
  const w = waitingList(punches, comments, siteExits);
  return w ? `${w.list} ${w.total === 1 ? "is" : "are"} not synced yet` : null;
}

// ---- Delete account (biometric audit b; functions/src/employeeAccount.ts) ----
// Decisions 2026-11-17: Q1 B - refused while clocked in or on a break, no
// automatic clock-out; Q4 A - the phone syncs first and refuses while
// anything is still waiting (it would be lost with the login).

const DELETE_ACCOUNT_OPEN_SHIFT = "Clock out first, then delete your account.";
const DELETE_ACCOUNT_FAILED = "Couldn't delete your account. Try again.";
const DELETE_ACCOUNT_OFFLINE = "No connection. Connect to the internet and try again.";

// Clocked in or on a break, from the self view's last event plus any punch
// still on the phone (an offline clock-in counts at once). The server checks
// again before deleting anything.
function deleteAccountOpenShift(view, queuedItems, companyId, employeeId, nowMs) {
  const server =
    view && view.lastEventType ? [{ id: "self-view-last", type: view.lastEventType, timestamp: view.lastEventTimestamp }] : [];
  const events = foldQueuedEvents(server, queuedItems || [], companyId, employeeId, nowMs);
  const status = deriveHomeState(events, nowMs, "UTC").status;
  return status === "in" || status === "break";
}

// What is still waiting to sync for this employee (waiting or syncing).
// "Not synced" punches/comments (failed - the server already refused them,
// they never sync by themselves) don't block, or they could block forever.
function deleteAccountWaitingCounts(punches, comments, siteExits, companyId, employeeId) {
  const waiting = (items) =>
    (items || []).filter(
      (i) => i.companyId === companyId && i.employeeId === employeeId && (i.status === "waiting" || i.status === "syncing")
    ).length;
  return { punches: waiting(punches), comments: waiting(comments), siteExits: waiting(siteExits) };
}

// After the sync: null, or why the account can't be deleted yet.
function deleteAccountWaitingMessage(punches, comments, siteExits) {
  const w = waitingList(punches, comments, siteExits);
  if (!w) return null;
  return `${w.list} ${w.total === 1 ? "hasn't" : "haven't"} synced yet. Connect to the internet and try again.`;
}

// The callable's error -> what the confirm box shows.
function deleteAccountErrorMessage(err) {
  const code = err && typeof err.code === "string" ? err.code.replace(/^functions\//, "") : "";
  if (code === "failed-precondition") return DELETE_ACCOUNT_OPEN_SHIFT;
  if (code === "unavailable" || code === "deadline-exceeded") return DELETE_ACCOUNT_OFFLINE;
  return DELETE_ACCOUNT_FAILED;
}

module.exports = {
  NOT_SET,
  settingsRows,
  formatBirthday,
  updateLabel,
  buildSettingsInfo,
  permissionToggleAction,
  logoutWarning,
  logoutCounts,
  DELETE_ACCOUNT_OPEN_SHIFT,
  deleteAccountOpenShift,
  deleteAccountWaitingCounts,
  deleteAccountWaitingMessage,
  deleteAccountErrorMessage,
};
