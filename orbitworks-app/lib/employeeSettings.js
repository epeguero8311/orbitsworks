// Employee App Phase 5 - what the Settings tab shows (decided 2026-11-03,
// Settings 14-20; Phase 10 A1), with no React Native, Expo or Firebase
// imports so test/employeeSettings.test.js can run it under `node --test`
// (same pattern as historyDays.js).
//   - email: the one they signed in with (the login's), else the self view's
//   - photo, name, birthday: the employee's own self view (employeeSelfViews,
//     server-written, no PIN / rate / face)
//   - PIN: **** until they tap Show (getMyPin, online only - useMyPin.js)
//   - company: the company the account is under - the parent company,
//     never the subcontractor (useEmployeeAppConfig)
//   - Update: the first 8 characters of the OTA update id, or "Built-in"
// Phase 10 (A1): no Subcontractor, Job site or Location access rows.
// Everything is view only. The Notifications and Location switches mirror
// the phone's own permission (permissionToggleAction); no push token.

const { pendingSiteExitCount } = require("./siteExitLogic");
const { badgeCount } = require("./punchQueueLogic");

const NOT_SET = "Not set";
const BUILT_IN = "Built-in";
const UPDATE_ID_CHARS = 8;
// Shown until Show is tapped. The PIN is never saved on the phone.
const PIN_MASK = "****";
// How long a shown PIN stays on screen before it hides again.
const PIN_SHOW_MS = 30 * 1000;

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
// [label, value]. info = buildSettingsInfo(...), pinText = pinRowText(...)
// (the PIN row also gets the Show / Hide button on the screen).
function settingsRows(info, pinText = PIN_MASK) {
  return [
    ["Email", info.email],
    ["PIN", pinText],
    ["Birthday", info.birthday],
    ["Company", info.company],
  ];
}

// The PIN row's text for each Show PIN state (useMyPin.js):
//   hidden | loading | shown | offline | noPin | inactive | tooMany | error
function pinRowText(state) {
  const status = state && state.status;
  if (status === "shown" && typeof state.pin === "string") return state.pin;
  if (status === "loading") return "Loading...";
  if (status === "offline") return "Connect to the internet to see your PIN";
  if (status === "noPin") return "Not set - ask your admin";
  if (status === "inactive") return "Your account is inactive";
  if (status === "tooMany") return "Try again in a few minutes";
  if (status === "error") return "Couldn't load your PIN. Try again.";
  return PIN_MASK;
}

// The PIN row's button: Hide while shown, nothing while loading, else Show.
function pinButtonLabel(state) {
  const status = state && state.status;
  if (status === "shown") return "Hide";
  if (status === "loading") return null;
  return "Show";
}

// getMyPin's answer (or error) -> the next Show PIN state.
function pinStateFromResult(result, err) {
  if (err) {
    const reason = err.details && err.details.reason;
    if (reason === "tooMany" || err.code === "functions/resource-exhausted") return { status: "tooMany" };
    if (err.code === "functions/unavailable" || err.code === "functions/deadline-exceeded") return { status: "offline" };
    return { status: "error" };
  }
  if (result && result.status === "ok" && typeof result.pin === "string") return { status: "shown", pin: result.pin };
  if (result && result.status === "noPin") return { status: "noPin" };
  if (result && result.status === "inactive") return { status: "inactive" };
  return { status: "error" };
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

function logoutWarning(punches, comments, siteExits) {
  const p = punches > 0 ? punches : 0;
  const c = comments > 0 ? comments : 0;
  const x = siteExits > 0 ? siteExits : 0;
  if (p + c + x === 0) return null;
  const parts = [];
  if (p) parts.push(`${p} punch${p === 1 ? "" : "es"}`);
  if (c) parts.push(`${c} comment${c === 1 ? "" : "s"}`);
  if (x) parts.push(`${x} job site record${x === 1 ? "" : "s"}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `${list} ${p + c + x === 1 ? "is" : "are"} not synced yet`;
}

module.exports = {
  NOT_SET,
  PIN_MASK,
  PIN_SHOW_MS,
  settingsRows,
  pinRowText,
  pinButtonLabel,
  pinStateFromResult,
  formatBirthday,
  updateLabel,
  buildSettingsInfo,
  permissionToggleAction,
  logoutWarning,
  logoutCounts,
};
