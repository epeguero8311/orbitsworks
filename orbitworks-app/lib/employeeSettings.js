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

const { NO_SITE_NAME } = require("./employeeHome");

const NOT_SET = "Not set";
const NONE = "None";
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

module.exports = {
  NOT_SET,
  formatBirthday,
  subcontractorLabel,
  jobSiteLabel,
  updateLabel,
  buildSettingsInfo,
  permissionToggleAction,
};
