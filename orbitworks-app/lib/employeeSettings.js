// Employee App Phase 5 - what the Settings tab shows (decided 2026-11-03,
// Settings 14-20), with no React Native, Expo or Firebase imports so
// test/employeeSettings.test.js can run it under `node --test` (same
// pattern as historyDays.js).
//   - photo, name, email, birthday, subcontractor: the employee's own self
//     view (employeeSelfViews, server-written, no PIN / rate / face). No
//     email there -> the login's own email (decided 2026-11-03)
//   - company: the company that created them (useEmployeeAppConfig)
//   - job site: the assigned jobSites docs, comma-separated
//   - Update: the first 8 characters of the OTA update id, or "Built-in"
// Everything is view only. The Notifications and Location switches mirror
// the phone's own permission (permissionToggleAction); no push token.

const { pendingSiteExitCount } = require("./siteExitLogic");
const { NO_SITE_NAME } = require("./employeeHome");
const { badgeCount } = require("./punchQueueLogic");

const NOT_SET = "Not set";
const NONE = "None";
const BUILT_IN = "Built-in";
const UPDATE_ID_CHARS = 8;
// The PIN itself is never kept on the phone for display.
const PIN_MASK = "****";

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

function subcontractorLabel(view) {
  return textOr(view && view.subcontractorName, NONE);
}

// The assigned sites, in the order they are assigned, as one line. A site
// that couldn't be read or is closed (active: false) is left out.
// sites = { [siteId]: { name, active } }
function jobSiteLabel(assignedSiteIds, sites) {
  const ids = Array.isArray(assignedSiteIds) ? assignedSiteIds : [];
  const names = ids
    .map((id) => sites && sites[id])
    .filter((site) => site && site.active !== false)
    .map((site) => textOr(site.name, NO_SITE_NAME));
  return names.length ? names.join(", ") : NONE;
}

// update = { updateId, isEmbeddedLaunch } from expo-updates. The bundle
// inside the build (no OTA update running) is "Built-in".
function updateLabel(update) {
  if (!update || update.isEmbeddedLaunch || typeof update.updateId !== "string" || !update.updateId) return BUILT_IN;
  return update.updateId.slice(0, UPDATE_ID_CHARS);
}

// The rows Settings shows. Only these fields - nothing else from the self
// view is ever passed on. loginEmail = the signed-in login's email.
function buildSettingsInfo({ view, companyName, sites, update, loginEmail }) {
  const v = view || {};
  return {
    photoUrl: textOr(v.photoUrl, null),
    name: textOr(v.name, ""),
    email: textOr(v.email, textOr(loginEmail, NOT_SET)),
    birthday: formatBirthday(v.dob),
    company: textOr(companyName, ""),
    subcontractor: subcontractorLabel(view),
    jobSite: jobSiteLabel(v.assignedSiteIds, sites),
    update: updateLabel(update),
  };
}

// The Settings tab's view-only rows under the photo and name, in order:
// [label, value]. info = buildSettingsInfo(...).
function settingsRows(info) {
  return [
    ["Logged in as", info.email],
    ["PIN", PIN_MASK],
    ["Birthday", info.birthday],
    ["Company", info.company],
    ["Subcontractor", info.subcontractor],
    ["Job site", info.jobSite],
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

// Phase 8: the Settings "Location access" row.
function locationAccessLabel(access) {
  if (access === "always") return "Always";
  if (access === "whileUsing") return "While using";
  return "Off";
}

module.exports = {
  locationAccessLabel,
  NOT_SET,
  PIN_MASK,
  settingsRows,
  formatBirthday,
  subcontractorLabel,
  jobSiteLabel,
  updateLabel,
  buildSettingsInfo,
  permissionToggleAction,
  logoutWarning,
  logoutCounts,
};
