// Employee App Phase 5 - Settings data (lib/employeeSettings.js): the rows
// the Settings tab shows from the self view, the company, the assigned job
// sites and the app update, plus what a Notifications / Location switch tap
// does. Run: node --test test/employeeSettings.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("../lib/employeeSettings");

const view = {
  name: "Ana Lopez",
  email: "ana@example.com",
  dob: "1990-01-31",
  photoUrl: "https://example.com/ana.jpg",
  assignedSiteIds: ["site2", "site1"],
  subcontractorId: "sub1",
  subcontractorName: "Lopez Drywall",
};
const sites = {
  site1: { name: "Main St", active: true },
  site2: { name: "Oak Ave", active: true },
};

test("birthday: YYYY-MM-DD as a long date, never shifted a day; missing or bad -> Not set", () => {
  assert.equal(s.formatBirthday("1990-01-31"), "January 31, 1990");
  assert.equal(s.formatBirthday("2000-12-01"), "December 1, 2000");
  assert.equal(s.formatBirthday("2024-02-29"), "February 29, 2024");
  for (const bad of [null, undefined, "", "1990-13-01", "1990-02-30", "31/01/1990", "1990-1-5", 19900131]) {
    assert.equal(s.formatBirthday(bad), "Not set", String(bad));
  }
  assert.equal(s.NOT_SET, "Not set");
});

test("subcontractor: the name, or None", () => {
  assert.equal(s.subcontractorLabel(view), "Lopez Drywall");
  assert.equal(s.subcontractorLabel({ ...view, subcontractorName: null }), "None");
  assert.equal(s.subcontractorLabel({ ...view, subcontractorName: "" }), "None");
  assert.equal(s.subcontractorLabel(null), "None");
});

test("job site: assigned sites in assigned order, comma-separated; closed or unknown skipped; none -> None", () => {
  assert.equal(s.jobSiteLabel(view.assignedSiteIds, sites), "Oak Ave, Main St");
  assert.equal(s.jobSiteLabel(["site1"], sites), "Main St");
  assert.equal(s.jobSiteLabel(["site1", "gone"], sites), "Main St", "a site that can't be read is skipped");
  assert.equal(s.jobSiteLabel(["site1", "site2"], { ...sites, site2: { name: "Oak Ave", active: false } }), "Main St", "closed site skipped");
  assert.equal(s.jobSiteLabel(["site1"], { site1: { name: "", active: true } }), "Not specified", "a site with no name");
  assert.equal(s.jobSiteLabel([], sites), "None");
  assert.equal(s.jobSiteLabel(undefined, sites), "None");
  assert.equal(s.jobSiteLabel(["site1"], {}), "None");
});

test("update line: first 8 characters of the update id, or Built-in", () => {
  assert.equal(s.updateLabel({ updateId: "0a1b2c3d-4e5f-6789-abcd-ef0123456789", isEmbeddedLaunch: false }), "0a1b2c3d");
  assert.equal(s.updateLabel({ updateId: "0a1b2c3d-4e5f", isEmbeddedLaunch: true }), "Built-in", "running the bundle inside the build");
  assert.equal(s.updateLabel({ updateId: null, isEmbeddedLaunch: false }), "Built-in");
  assert.equal(s.updateLabel({}), "Built-in");
  assert.equal(s.updateLabel(null), "Built-in");
});

test("settings info: every row from the self view, company, sites and update", () => {
  const info = s.buildSettingsInfo({
    view,
    companyName: "Acme Builders",
    sites,
    update: { updateId: "0a1b2c3d-4e5f", isEmbeddedLaunch: false },
  });
  assert.deepEqual(info, {
    photoUrl: "https://example.com/ana.jpg",
    name: "Ana Lopez",
    email: "ana@example.com",
    birthday: "January 31, 1990",
    company: "Acme Builders",
    subcontractor: "Lopez Drywall",
    jobSite: "Oak Ave, Main St",
    update: "0a1b2c3d",
  });
});

test("settings info: nothing loaded yet -> safe placeholders, never undefined", () => {
  const info = s.buildSettingsInfo({ view: null, companyName: "", sites: {}, update: null });
  assert.deepEqual(info, {
    photoUrl: null,
    name: "",
    email: "Not set",
    birthday: "Not set",
    company: "",
    subcontractor: "None",
    jobSite: "None",
    update: "Built-in",
  });
});

// Decided 2026-11-03: no email on the self view -> the login's own email.
test("settings info: email falls back to the login's email; Not set only when both are missing", () => {
  const base = { view, companyName: "Acme", sites, update: null };
  assert.equal(s.buildSettingsInfo({ ...base, loginEmail: "login@example.com" }).email, "ana@example.com", "self view wins");
  assert.equal(s.buildSettingsInfo({ ...base, view: { ...view, email: null }, loginEmail: "login@example.com" }).email, "login@example.com");
  assert.equal(s.buildSettingsInfo({ ...base, view: { ...view, email: "" }, loginEmail: "login@example.com" }).email, "login@example.com");
  assert.equal(s.buildSettingsInfo({ ...base, view: null, loginEmail: "login@example.com" }).email, "login@example.com", "self view not in yet");
  assert.equal(s.buildSettingsInfo({ ...base, view: { ...view, email: null }, loginEmail: null }).email, "Not set");
  assert.equal(s.buildSettingsInfo({ ...base, view: { ...view, email: null } }).email, "Not set");
});

test("settings info: the self view never shows a PIN or rate, even if one slipped in", () => {
  const info = s.buildSettingsInfo({ view: { ...view, pin: "1234", hourlyRate: 25 }, companyName: "Acme", sites, update: null });
  assert.ok(!JSON.stringify(info).includes("1234"));
  assert.equal(Object.keys(info).length, 8);
});

// Same flow as the Location switch (locationPermission.js +
// supervisor SettingsScreen.js handleToggleLocation): the phone's own
// permission is the state; the app can ask once, else only the phone's
// Settings app can change it.
test("switch tap: what to do for each permission state", () => {
  const a = s.permissionToggleAction;
  // Turning on
  assert.equal(a(true, { status: "granted", canAskAgain: true }), "none");
  assert.equal(a(true, { status: "undetermined", canAskAgain: true }), "ask");
  assert.equal(a(true, { status: "undetermined", canAskAgain: false }), "none");
  assert.equal(a(true, { status: "denied", canAskAgain: false }), "openSettings");
  assert.equal(a(true, { status: "denied", canAskAgain: true }), "none");
  // Turning off: only the phone's Settings app can take a permission back.
  assert.equal(a(false, { status: "granted", canAskAgain: true }), "openSettings");
  assert.equal(a(false, { status: "denied", canAskAgain: false }), "none");
  assert.equal(a(false, { status: "undetermined", canAskAgain: true }), "none");
  // Unknown status reads as not granted.
  assert.equal(a(true, null), "none");
});

// Layer 7c: the view-only rows, in order, under the photo and name.
test("settings rows: labels and order, PIN always masked", () => {
  const info = s.buildSettingsInfo({ view, companyName: "Acme Builders", sites, update: null, loginEmail: null });
  assert.deepEqual(s.settingsRows(info), [
    ["Logged in as", "ana@example.com"],
    ["PIN", "****"],
    ["Birthday", "January 31, 1990"],
    ["Company", "Acme Builders"],
    ["Subcontractor", "Lopez Drywall"],
    ["Job site", "Oak Ave, Main St"],
  ]);
  const empty = s.settingsRows(s.buildSettingsInfo({ view: null, companyName: "", sites: {}, update: null }));
  assert.deepEqual(empty.map((r) => r[1]), ["Not set", "****", "Not set", "", "None", "None"]);
  assert.equal(s.PIN_MASK, "****");
});

// Log out warning (decision 7c-A): unsynced punches AND comments stay on
// the phone, so the warning names both. null = nothing waiting, no warning.
test("log out warning: counts punches and comments; none -> no warning", () => {
  assert.equal(s.logoutWarning(0, 0), null);
  assert.equal(s.logoutWarning(1, 0), "1 punch is not synced yet");
  assert.equal(s.logoutWarning(2, 0), "2 punches are not synced yet");
  assert.equal(s.logoutWarning(0, 1), "1 comment is not synced yet");
  assert.equal(s.logoutWarning(0, 3), "3 comments are not synced yet");
  assert.equal(s.logoutWarning(1, 1), "1 punch and 1 comment are not synced yet");
  assert.equal(s.logoutWarning(2, 1), "2 punches and 1 comment are not synced yet");
  assert.equal(s.logoutWarning(undefined, undefined), null);
});
