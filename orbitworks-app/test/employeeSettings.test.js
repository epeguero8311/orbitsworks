// Employee App Phase 5 - Settings data (lib/employeeSettings.js): the rows
// the Settings tab shows from the self view, the company and the app
// update, the Show PIN states, plus what a Notifications / Location switch
// tap does. Run: node --test test/employeeSettings.test.js
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

test("birthday: YYYY-MM-DD as a long date, never shifted a day; missing or bad -> Not set", () => {
  assert.equal(s.formatBirthday("1990-01-31"), "January 31, 1990");
  assert.equal(s.formatBirthday("2000-12-01"), "December 1, 2000");
  assert.equal(s.formatBirthday("2024-02-29"), "February 29, 2024");
  for (const bad of [null, undefined, "", "1990-13-01", "1990-02-30", "31/01/1990", "1990-1-5", 19900131]) {
    assert.equal(s.formatBirthday(bad), "Not set", String(bad));
  }
  assert.equal(s.NOT_SET, "Not set");
});

test("update line: first 8 characters of the update id, or Built-in", () => {
  assert.equal(s.updateLabel({ updateId: "0a1b2c3d-4e5f-6789-abcd-ef0123456789", isEmbeddedLaunch: false }), "0a1b2c3d");
  assert.equal(s.updateLabel({ updateId: "0a1b2c3d-4e5f", isEmbeddedLaunch: true }), "Built-in", "running the bundle inside the build");
  assert.equal(s.updateLabel({ updateId: null, isEmbeddedLaunch: false }), "Built-in");
  assert.equal(s.updateLabel({}), "Built-in");
  assert.equal(s.updateLabel(null), "Built-in");
});

test("settings info: every row from the self view, company and update (no subcontractor / job site)", () => {
  const info = s.buildSettingsInfo({
    view,
    companyName: "Acme Builders",
    update: { updateId: "0a1b2c3d-4e5f", isEmbeddedLaunch: false },
  });
  assert.deepEqual(info, {
    photoUrl: "https://example.com/ana.jpg",
    name: "Ana Lopez",
    email: "ana@example.com",
    birthday: "January 31, 1990",
    company: "Acme Builders",
    update: "0a1b2c3d",
  });
});

test("settings info: nothing loaded yet -> safe placeholders, never undefined", () => {
  const info = s.buildSettingsInfo({ view: null, companyName: "", update: null });
  assert.deepEqual(info, {
    photoUrl: null,
    name: "",
    email: "Not set",
    birthday: "Not set",
    company: "",
    update: "Built-in",
  });
});

// Phase 10 A1: the email they signed in with; the self view's only when
// the login has none.
test("settings info: email is the login's; the self view's only as a fallback; Not set when both are missing", () => {
  const base = { view, companyName: "Acme", update: null };
  assert.equal(s.buildSettingsInfo({ ...base, loginEmail: "login@example.com" }).email, "login@example.com", "login wins");
  assert.equal(s.buildSettingsInfo({ ...base, loginEmail: null }).email, "ana@example.com");
  assert.equal(s.buildSettingsInfo({ ...base, loginEmail: "" }).email, "ana@example.com");
  assert.equal(s.buildSettingsInfo({ ...base, view: null, loginEmail: "login@example.com" }).email, "login@example.com", "self view not in yet");
  assert.equal(s.buildSettingsInfo({ ...base, view: { ...view, email: null }, loginEmail: null }).email, "Not set");
  assert.equal(s.buildSettingsInfo({ ...base, view: { ...view, email: null } }).email, "Not set");
});

test("settings info: the self view never shows a PIN or rate, even if one slipped in", () => {
  const info = s.buildSettingsInfo({ view: { ...view, pin: "1234", hourlyRate: 25 }, companyName: "Acme", update: null });
  assert.ok(!JSON.stringify(info).includes("1234"));
  assert.ok(!JSON.stringify(info).includes("Lopez Drywall"), "never the subcontractor");
  assert.equal(Object.keys(info).length, 6);
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
test("settings rows: Email, PIN, Birthday, Company - no Subcontractor or Job site (Phase 10 A1)", () => {
  const info = s.buildSettingsInfo({ view, companyName: "Acme Builders", update: null, loginEmail: null });
  assert.deepEqual(s.settingsRows(info), [
    ["Email", "ana@example.com"],
    ["PIN", "****"],
    ["Birthday", "January 31, 1990"],
    ["Company", "Acme Builders"],
  ]);
  assert.deepEqual(s.settingsRows(info, "4821")[1], ["PIN", "4821"], "the shown PIN");
  const empty = s.settingsRows(s.buildSettingsInfo({ view: null, companyName: "", update: null }));
  assert.deepEqual(empty.map((r) => r[1]), ["Not set", "****", "Not set", ""]);
  assert.equal(s.PIN_MASK, "****");
});

test("Show PIN: row text and button for every state; hidden after 30 s", () => {
  assert.equal(s.pinRowText({ status: "hidden" }), "****");
  assert.equal(s.pinRowText(null), "****");
  assert.equal(s.pinRowText({ status: "shown", pin: "4821" }), "4821");
  assert.equal(s.pinRowText({ status: "shown" }), "****", "no PIN in hand: masked");
  assert.equal(s.pinRowText({ status: "loading" }), "Loading...");
  assert.equal(s.pinRowText({ status: "offline" }), "Connect to the internet to see your PIN");
  assert.equal(s.pinRowText({ status: "noPin" }), "Not set - ask your admin");
  assert.equal(s.pinRowText({ status: "inactive" }), "Your account is inactive");
  assert.equal(s.pinRowText({ status: "tooMany" }), "Try again in a few minutes");
  assert.equal(s.pinRowText({ status: "error" }), "Couldn't load your PIN. Try again.");
  assert.equal(s.pinButtonLabel({ status: "shown", pin: "1" }), "Hide");
  assert.equal(s.pinButtonLabel({ status: "loading" }), null);
  for (const status of ["hidden", "offline", "noPin", "tooMany", "error"]) assert.equal(s.pinButtonLabel({ status }), "Show", status);
  assert.equal(s.PIN_SHOW_MS, 30000);
});

test("Show PIN: getMyPin answers and errors -> state", () => {
  assert.deepEqual(s.pinStateFromResult({ status: "ok", pin: "4821" }), { status: "shown", pin: "4821" });
  assert.deepEqual(s.pinStateFromResult({ status: "noPin" }), { status: "noPin" });
  assert.deepEqual(s.pinStateFromResult({ status: "inactive" }), { status: "inactive" });
  assert.deepEqual(s.pinStateFromResult({ status: "ok" }), { status: "error" });
  assert.deepEqual(s.pinStateFromResult(null), { status: "error" });
  assert.deepEqual(s.pinStateFromResult(null, { code: "functions/resource-exhausted", details: { reason: "tooMany" } }), { status: "tooMany" });
  assert.deepEqual(s.pinStateFromResult(null, { code: "functions/unavailable" }), { status: "offline" });
  assert.deepEqual(s.pinStateFromResult(null, { code: "functions/deadline-exceeded" }), { status: "offline" });
  assert.deepEqual(s.pinStateFromResult(null, { code: "functions/permission-denied" }), { status: "error" });
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

// Log out counts (decision: no 10-second delay): everything of this
// employee still on the phone - Waiting, Syncing or Not synced - even if it
// was saved a second ago. The Sync tab badge keeps its 10 s delay.
test("log out counts: every unsynced punch and comment, fresh ones too; synced and other employees skipped", () => {
  const now = Date.now();
  const item = (fields) => ({ companyId: "co1", employeeId: "emp1", status: "waiting", createdAt: now - 1000, ...fields });
  const punches = [
    item({ requestId: "p-fresh" }),
    item({ requestId: "p-sync", status: "syncing" }),
    item({ requestId: "p-fail", status: "failed", createdAt: now - 60000 }),
    item({ requestId: "p-done", status: "synced" }),
    item({ requestId: "p-ben", employeeId: "ben" }),
  ];
  const comments = [item({ requestId: "c-fresh" }), item({ requestId: "c-done", status: "synced" }), item({ requestId: "c-co2", companyId: "co2" })];
  assert.deepEqual(s.logoutCounts(punches, comments, "co1", "emp1"), { punches: 3, comments: 1, siteExits: 0 });
  assert.equal(s.logoutWarning(3, 1), "3 punches and 1 comment are not synced yet");
  assert.deepEqual(s.logoutCounts([], [], "co1", "emp1"), { punches: 0, comments: 0, siteExits: 0 });
});

test("Phase 8: log out warning counts leave tracking rows too", () => {
  assert.equal(s.logoutWarning(0, 0, 1), "1 job site record is not synced yet");
  assert.equal(s.logoutWarning(1, 0, 2), "1 punch and 2 job site records are not synced yet");
  assert.equal(s.logoutWarning(2, 1, 1), "2 punches, 1 comment and 1 job site record are not synced yet");
  assert.equal(s.logoutWarning(0, 0, 0), null);
  const exits = [
    { companyId: "co1", employeeId: "emp1", status: "waiting" },
    { companyId: "co1", employeeId: "emp1", status: "synced" },
    { companyId: "co1", employeeId: "other", status: "waiting" },
  ];
  assert.equal(s.logoutCounts([], [], "co1", "emp1", exits).siteExits, 1);
  assert.equal(s.logoutCounts([], [], "co1", "emp1").siteExits, 0);
});
