// Task 4 (Admin Permissions) - the REAL compiled functions on the Firestore +
// Auth emulators: setAdminAccess hierarchy (D5), new admins start with
// nothing (D9/D16, G2), site + permission checks on approve / time edits /
// tips / clock actions (D2/D7/D10/D18), legacy admins unchanged (D6/D8),
// and the new-job-site trigger (D17).
// Run (from functions/): firebase emulators:exec --only firestore,auth "node --test test/adminPermissions.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-adminperms-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

const C = "co1";
const P = process.env.GCLOUD_PROJECT;
const ALL = { approveHours: true, employees: true, editPay: true, exportPayroll: true, analytics: true, billing: true, settings: true, invites: true };
const NONE = Object.fromEntries(Object.keys(ALL).map((k) => [k, false]));

async function clearAll() {
  await fetch(`http://localhost:8090/emulator/v1/projects/${P}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: "DELETE" });
}

const company = () => db.collection("companies").doc(C);
const ct = (day, hhmm) => admin.firestore.Timestamp.fromMillis(Date.parse(`2026-11-${String(day).padStart(2, "0")}T${hhmm}:00-06:00`));

// A login (Auth user + users doc + linked employee) with the given access.
async function login(uid, role, adminAccess, { employeeId = `emp-${uid}`, isSupervisor = false } = {}) {
  await admin.auth().deleteUser(uid).catch(() => {});
  await admin.auth().createUser({ uid, email: `${uid}@x.co` });
  await admin.auth().setCustomUserClaims(uid, { role, companyId: C, employeeId });
  await company().collection("employees").doc(employeeId).set({ name: uid, active: true, linkedUserId: uid, isAdmin: role === "admin", isSupervisor });
  await db.doc(`users/${uid}`).set({ role, companyId: C, name: `Name ${uid}`, ...(adminAccess ? { adminAccess } : {}) });
  return { uid, token: { role, companyId: C, employeeId } };
}

async function seed() {
  await clearAll();
  await company().set({ name: "Co", tipsEnabled: true });
  await company().collection("jobSites").doc("siteA").set({ name: "Site A", active: true });
  await company().collection("jobSites").doc("siteC").set({ name: "Site C", active: true });
  await company().collection("employees").doc("juan").set({ name: "Juan", active: true });
  // Juan: one shift on A, one on C (Nov 16), plus an open shift on C.
  const shift = async (id, site, day, from, to) => {
    const base = { employeeId: "juan", employeeName: "Juan", siteId: site, siteName: site, createdByUid: "seed" };
    await company().collection("clockEvents").doc(id).set({ ...base, type: "in", timestamp: ct(day, from) });
    if (to) await company().collection("clockEvents").doc(`${id}-out`).set({ ...base, type: "out", timestamp: ct(day, to) });
    await company().collection("timesheetApprovals").doc(id).set({ employeeId: "juan", employeeName: "Juan", date: `2026-11-${day}`, siteId: site, siteName: site, status: "pending" });
  };
  await shift("sA", "siteA", 16, "08:00", "13:00");
  await shift("sC", "siteC", 16, "14:00", "23:00");
  const users = {
    owner: await login("owner", "owner", null),
    full: await login("full", "admin", { level: "full", sites: "all", permissions: ALL }),
    full2: await login("full2", "admin", { level: "full", sites: "all", permissions: ALL }),
    legacy: await login("legacy", "admin", null),
    restricted: await login("restricted", "admin", { level: "admin", sites: ["siteA"], permissions: { ...NONE, approveHours: true, editPay: true, invites: true } }),
    plain: await login("plain", "admin", { level: "admin", sites: "all", permissions: { ...NONE, invites: true } }),
    nothing: await login("nothing", "admin", { level: "admin", sites: [], permissions: NONE }),
  };
  return users;
}

const run = (fn, data, auth) => funcs[fn].run({ data, auth, rawRequest: {} });
const denied = (e) => e.code === "permission-denied";
const user = async (uid) => (await db.doc(`users/${uid}`).get()).data();
const claims = async (uid) => (await admin.auth().getUser(uid)).customClaims;
const approval = async (id) => (await company().collection("timesheetApprovals").doc(id).get()).data();
const accessBody = (targetUid, over = {}) => ({ targetUid, level: "admin", sites: ["siteA"], permissions: { ...NONE, approveHours: true }, ...over });

test("setAdminAccess: owner > Full access > Admin; nobody edits the owner or themselves", async () => {
  const u = await seed();
  // Owner can do anything to admins, incl. granting Full access.
  await run("setAdminAccess", accessBody("nothing", { level: "full" }), u.owner);
  assert.equal((await user("nothing")).adminAccess.level, "full");
  assert.equal((await claims("nothing")).lvl, "full");
  assert.ok((await user("nothing")).roleChangedAt, "RC1 refresh bumped");
  // Full access sets a regular admin...
  await run("setAdminAccess", accessBody("plain"), u.full);
  assert.deepEqual((await user("plain")).adminAccess.sites, ["siteA"]);
  assert.deepEqual(await claims("plain"), { role: "admin", companyId: C, employeeId: "emp-plain", lvl: "admin", allSites: false, perms: ["ah"] });
  // ...but can't grant Full access, nor touch another Full access admin.
  await assert.rejects(run("setAdminAccess", accessBody("plain", { level: "full" }), u.full), denied);
  await assert.rejects(run("setAdminAccess", accessBody("full2"), u.full), denied);
  // A regular admin (even with every other permission) can't set access.
  await assert.rejects(run("setAdminAccess", accessBody("nothing"), u.restricted), denied);
  await assert.rejects(run("setAdminAccess", accessBody("restricted", { sites: "all", permissions: ALL }), u.restricted), denied);
  await assert.rejects(run("setAdminAccess", accessBody("legacy"), u.legacy), denied);
  // Nobody edits themselves; nobody edits the owner.
  await assert.rejects(run("setAdminAccess", accessBody("full"), u.full), denied);
  await assert.rejects(run("setAdminAccess", accessBody("owner"), u.full), denied);
  // Unknown sites refused.
  await assert.rejects(run("setAdminAccess", accessBody("plain", { sites: ["nope"] }), u.owner), (e) => e.code === "invalid-argument");
});

test("restricted admin: approve / tip / delete / edit only their sites' shifts", async () => {
  const u = await seed();
  await run("setApprovalStatus", { eventId: "sA", status: "approved" }, u.restricted);
  assert.equal((await approval("sA")).status, "approved");
  await assert.rejects(run("setApprovalStatus", { eventId: "sC", status: "approved" }, u.restricted), denied);
  // Bulk with one other-site row: nothing written.
  await run("setApprovalStatus", { eventId: "sA", status: "pending" }, u.restricted);
  await assert.rejects(run("setApprovalStatusBulk", { eventIds: ["sA", "sC"], status: "approved" }, u.restricted), denied);
  assert.equal((await approval("sA")).status, "pending");
  // Tips: Edit pay + site (D7).
  await run("setShiftTip", { eventId: "sA", amountCents: 500 }, u.restricted);
  await assert.rejects(run("setShiftTip", { eventId: "sC", amountCents: 500 }, u.restricted), denied);
  await assert.rejects(run("setShiftTip", { eventId: "sA", amountCents: 600 }, u.plain), denied); // no Edit pay
  // Time edits = Approve hours + site (D10).
  await assert.rejects(run("correctClockEvent", { eventId: "sC-out", newTimestamp: ct(16, "22:00").toMillis() }, u.restricted), denied);
  await assert.rejects(run("deleteTimesheetSession", { approvalId: "sC", eventIds: ["sC", "sC-out"] }, u.restricted), denied);
  await assert.rejects(run("assignSessionSite", { approvalId: "sA", eventIds: ["sA", "sA-out"], siteId: "siteC" }, u.restricted), denied);
  await assert.rejects(
    run("addManualTimestamp", { employeeId: "juan", date: "2026-11-17", clockInTime: "08:00", clockOutTime: "12:00", siteId: "siteC", reason: "forgot" }, u.restricted),
    denied
  );
  // No Approve hours at all.
  await assert.rejects(run("setApprovalStatus", { eventId: "sA", status: "approved" }, u.plain), denied);
  await assert.rejects(run("setApprovalStatus", { eventId: "sA", status: "approved" }, u.nothing), denied);
});

test("legacy admin (no stored access) keeps everything except Billing; owner + Full access everything", async () => {
  const u = await seed();
  for (const who of [u.legacy, u.full, u.owner]) {
    await run("setApprovalStatus", { eventId: "sC", status: "approved" }, who);
    await run("setApprovalStatus", { eventId: "sC", status: "pending" }, who);
    await run("setShiftTip", { eventId: "sC", amountCents: who.uid.length * 100 }, who);
  }
});

test("adminClockAction: Approve hours + the open shift's site (D18)", async () => {
  const u = await seed();
  // Juan clocks in on C (open shift) through an all-sites admin.
  await run("adminClockAction", { employeeId: "juan", action: "in", siteId: "siteC", note: "" }, u.legacy);
  await assert.rejects(run("adminClockAction", { employeeId: "juan", action: "out", note: "x" }, u.restricted), denied);
  await assert.rejects(run("adminClockAction", { employeeId: "juan", action: "out" }, u.plain), denied); // no Approve hours
  await run("adminClockAction", { employeeId: "juan", action: "breakStart" }, u.full);
  await run("adminClockAction", { employeeId: "juan", action: "out", note: "done" }, u.owner);
  const evs = (await company().collection("clockEvents").where("employeeId", "==", "juan").orderBy("timestamp").get()).docs.map((d) => d.data());
  assert.deepEqual(evs.slice(-4).map((e) => [e.type, e.source, e.siteId]), [
    ["in", "adminManual", "siteC"],
    ["breakStart", "adminManual", "siteC"],
    ["breakEnd", "autoBreakEnd", "siteC"],
    ["out", "adminManual", "siteC"],
  ]);
  // A restricted admin can clock in only on their own sites.
  await assert.rejects(run("adminClockAction", { employeeId: "juan", action: "in", siteId: "siteC" }, u.restricted), denied);
  await run("adminClockAction", { employeeId: "juan", action: "in", siteId: "siteA" }, u.restricted);
  await run("adminClockAction", { employeeId: "juan", action: "outAt", atMs: Date.now() + 1000, note: "set" }, u.restricted);
});

test("Make admin (setEmployeeRole) starts with nothing; hierarchy on demote/deactivate/delete (D5, D16)", async () => {
  const u = await seed();
  await company().collection("employees").doc("bob").set({ name: "Bob", active: true, linkedUserId: "bob", isSupervisor: true });
  await admin.auth().deleteUser("bob").catch(() => {});
  await admin.auth().createUser({ uid: "bob", email: "bob@x.co" });
  await db.doc("users/bob").set({ role: "supervisor", companyId: C, name: "Bob" });
  // An admin with only Invites can make Bob an admin - he gets NO access.
  await run("setEmployeeRole", { employeeId: "bob", isAdmin: true, isSupervisor: true }, u.plain);
  assert.deepEqual((await user("bob")).adminAccess, { level: "admin", sites: [], permissions: NONE });
  const c = await claims("bob");
  assert.equal(c.role, "admin");
  assert.equal(c.allSites, false);
  assert.deepEqual(c.perms, []);
  assert.equal(c.sup, true, "still a supervisor (G1 sub A)");
  // ...but can't demote an admin (needs owner / Full access) or a Full admin.
  await assert.rejects(run("setEmployeeRole", { employeeId: "bob", isAdmin: false, isSupervisor: true }, u.plain), denied);
  await assert.rejects(run("setEmployeeRole", { employeeId: "emp-full2", isAdmin: false, isSupervisor: false }, u.full), denied);
  await assert.rejects(run("setEmployeeActive", { employeeId: "emp-full2", active: false }, u.full), denied);
  await assert.rejects(run("deleteEmployee", { employeeId: "emp-full2" }, u.full), denied);
  await assert.rejects(run("setEmployeeActive", { employeeId: "emp-full", active: false }, u.full), denied); // self
  // Owner can demote Full access; leaving admin drops the stored access.
  await run("setEmployeeRole", { employeeId: "emp-full2", isAdmin: false, isSupervisor: true }, u.owner);
  assert.equal((await user("full2")).adminAccess, undefined);
  assert.equal((await claims("full2")).lvl, undefined);
  // No Invites permission -> no role changes at all.
  await assert.rejects(run("setEmployeeRole", { employeeId: "juan", isAdmin: true, isSupervisor: false }, u.nothing), denied);
});

test("acceptInvite: an admin invite always starts with no access (G2), whatever the invite says", async () => {
  await seed();
  await db.doc("invites/inv1").set({
    email: "newadmin@x.co", companyId: C, role: "admin", assignedSiteIds: [], status: "pending", invitedByUid: "restricted",
    // Written past the rules (which refuse these) to prove acceptInvite ignores them.
    adminAccess: { level: "full", sites: "all", permissions: ALL }, level: "full",
  });
  const created = await admin.auth().createUser({ email: "newadmin@x.co", password: "secret123" });
  await funcs.acceptInvite.run({ data: { name: "New Admin", inviteId: "inv1" }, auth: { uid: created.uid, token: { email: "newadmin@x.co" } }, rawRequest: {} });
  assert.deepEqual((await user(created.uid)).adminAccess, { level: "admin", sites: [], permissions: NONE });
  const c = await claims(created.uid);
  assert.equal(c.lvl, "admin");
  assert.equal(c.allSites, false);
  assert.deepEqual(c.perms, []);
});

test("setSiteAdmins (owner / Full only) + a restricted creator gets their new site (D17)", async () => {
  const u = await seed();
  await company().collection("jobSites").doc("siteD").set({ name: "Site D", active: true });
  await assert.rejects(run("setSiteAdmins", { siteId: "siteD", adminUids: ["restricted"] }, u.restricted), denied);
  await run("setSiteAdmins", { siteId: "siteD", adminUids: ["restricted", "plain", "full", "owner"] }, u.full);
  assert.deepEqual((await user("restricted")).adminAccess.sites, ["siteA", "siteD"]);
  assert.equal((await user("plain")).adminAccess.sites, "all", "All-sites admin unchanged");

  await company().collection("jobSites").doc("siteE").set({ name: "Site E", active: true, createdByUid: "restricted" });
  await funcs.onJobSiteCreated.run({
    data: { data: () => ({ createdByUid: "restricted" }) },
    params: { companyId: C, siteId: "siteE" },
  });
  assert.deepEqual((await user("restricted")).adminAccess.sites, ["siteA", "siteD", "siteE"]);
  assert.deepEqual((await claims("restricted")).perms.sort(), ["ah", "inv", "pay"]);
});

// ---- getShiftData (server read path, D2-D4, D13) ----
const read = (data, auth) => funcs.getShiftData.run({ data, auth, rawRequest: {} });
const RANGE = { startMs: Date.parse("2026-11-16T00:00:00-06:00"), endMs: Date.parse("2026-11-16T23:59:59-06:00"), startDate: "2026-11-16", endDate: "2026-11-16" };

test("getShiftData shifts: a restricted admin gets only their sites' shifts + FULL day totals (rule 2)", async () => {
  const u = await seed();
  await company().update({ overtimeEnabled: true, dailyOvertimeThreshold: 8, weeklyOvertimeThreshold: 40, overtimeMultiplier: 1.5 });
  const r = await read({ purpose: "shifts", ...RANGE, want: { clockEvents: true, approvals: true, overtime: true } }, u.restricted);
  assert.deepEqual(r.clockEvents.map((e) => e.id).sort(), ["sA", "sA-out"]);
  assert.deepEqual(r.approvals.map((a) => a.id), ["sA"]);
  assert.ok(r.clockEvents[0].timestamp.__ts > 0, "timestamps travel as { __ts }");
  // Juan worked 5h on A + 9h on C = 14h that day, 6h OT (daily 8): the
  // restricted admin sees the full day numbers but no site C shift.
  assert.deepEqual(r.overtime.sA, {
    overtimeChanged: null,
    weekWorkedMinutesThrough: 5 * 60,
    overtimeMinutes: 0,
    dayKey: "2026-11-16",
    dayWorkedMinutes: 14 * 60,
    dayOvertimeMinutes: 6 * 60,
  });
  assert.equal(Object.keys(r.overtime).length, 1);
  // An all-sites admin gets everything (and no server OT - their hook computes it).
  const all = await read({ purpose: "shifts", ...RANGE, want: { clockEvents: true, approvals: true, overtime: true } }, u.plain);
  assert.equal(all.clockEvents.length, 4);
  assert.equal(all.overtime, undefined);
  // No access yet = nothing.
  const none = await read({ purpose: "shifts", ...RANGE, want: { clockEvents: true, approvals: true } }, u.nothing);
  assert.deepEqual([none.clockEvents.length, none.approvals.length], [0, 0]);
});

test("getShiftData export / analytics need their permission and return every site (rules 3 + 5)", async () => {
  const u = await seed();
  await assert.rejects(read({ purpose: "export", ...RANGE, want: { clockEvents: true } }, u.restricted), denied);
  await assert.rejects(read({ purpose: "analytics", ...RANGE, want: { clockEvents: true } }, u.restricted), denied);
  await run("setAdminAccess", accessBody("restricted", { permissions: { ...NONE, exportPayroll: true, analytics: true } }), u.owner);
  const e = await read({ purpose: "export", ...RANGE, want: { clockEvents: true, approvals: true } }, u.restricted);
  assert.equal(e.clockEvents.length, 4);
  assert.equal(e.approvals.length, 2);
  const a = await read({ purpose: "analytics", ...RANGE, want: { clockEvents: true } }, u.restricted);
  assert.equal(a.clockEvents.length, 4);
  // By-shift lookups stay site-filtered.
  const byShift = await read({ purpose: "shifts", clockInEventIds: ["sA", "sC"], want: { approvals: true, tipEdits: false } }, u.restricted);
  assert.deepEqual(byShift.approvals.map((x) => x.id), ["sA"]);
});

test("getShiftData overview: every site, but only the recent window (D13)", async () => {
  const u = await seed();
  const old = await read({ purpose: "overview", ...RANGE, want: { clockEvents: true } }, u.nothing);
  assert.equal(old.clockEvents.length, 0, "Nov 16 is outside the last 8 days of the real clock");
  await run("adminClockAction", { employeeId: "juan", action: "in", siteId: "siteC" }, u.owner);
  const now = await read({ purpose: "overview", startMs: Date.now() - 86400000, endMs: Date.now() + 60000, want: { clockEvents: true } }, u.nothing);
  // (Earlier tests' "now" punches can still be in the emulator.) Every site,
  // and nothing older than the window.
  assert.ok(now.clockEvents.some((e) => e.type === "in" && e.siteId === "siteC"));
  assert.ok(now.clockEvents.every((e) => e.timestamp.__ts >= Date.now() - 8 * 86400000));
});

test("getShiftData: re-approve 'OT changed' + weekly hours count every site for a restricted admin (gaps 1-2)", async () => {
  const u = await seed();
  await company().update({ overtimeEnabled: true, dailyOvertimeThreshold: 8, weeklyOvertimeThreshold: 40, overtimeMultiplier: 1.5 });
  // An earlier shift on site C (Sun Nov 15, 2h) the restricted admin can't see.
  const base = { employeeId: "juan", employeeName: "Juan", siteId: "siteC", siteName: "siteC", createdByUid: "seed" };
  await company().collection("clockEvents").doc("sC0").set({ ...base, type: "in", timestamp: ct(15, "06:00") });
  await company().collection("clockEvents").doc("sC0-out").set({ ...base, type: "out", timestamp: ct(15, "08:00") });
  // sA was approved with 60 min frozen OT, but with the same settings it
  // would have 0 now (an edit elsewhere moved it) -> re-approve warning.
  const snapshot = { weeklyThresholdHours: 40, dailyThresholdHours: 8, weekStartsOn: 1, multiplier: 1.5, roundOvertimeMinutes: 0, timeZone: "America/Chicago" };
  await company().collection("timesheetApprovals").doc("sA").update({
    status: "approved",
    autoBreakMinutesApplied: 0,
    autoBreakMinShiftHoursApplied: 0,
    overtimeApplied: { overtimeMinutes: 60, dailyOvertimeMinutes: 60, weeklyOvertimeMinutes: 0, workedMinutes: 300, settings: snapshot },
  });
  const weekFromMs = Date.parse("2026-11-15T00:00:00-06:00");
  const req = { purpose: "shifts", ...RANGE, weekFromMs, want: { clockEvents: true, overtime: true } };
  const r = await read(req, u.restricted);
  assert.deepEqual(r.clockEvents.map((e) => e.id).sort(), ["sA", "sA-out"], "still only site A shifts");
  assert.deepEqual(r.overtime.sA.overtimeChanged, { frozenMinutes: 60, liveMinutes: 0 });
  assert.equal(r.overtime.sA.overtimeMinutes, 60, "the frozen OT is what's shown");
  // Weekly hours through sA = site C's 2h (Nov 15) + sA's 5h, all sites.
  assert.equal(r.overtime.sA.weekWorkedMinutesThrough, 7 * 60);

  // Overtime OFF: no OT fields, weekly hours still all sites.
  await company().update({ overtimeEnabled: false });
  const off = await read(req, u.restricted);
  assert.equal(off.overtime.sA.overtimeMinutes, undefined);
  assert.equal(off.overtime.sA.overtimeChanged, null);
  assert.equal(off.overtime.sA.weekWorkedMinutesThrough, 7 * 60);
});

// ---- fillJobSiteCreator (backward-compatible job site create, Nov 25) ----
test("fillJobSiteCreator: fills a missing createdByUid from the auth context, only for this company's admin/owner", async () => {
  const { creatorToFill } = require("../lib/adminPermissions.js");
  const owner = { role: "owner", companyId: "c1" };
  assert.equal(creatorToFill({ data: { name: "S" }, authId: "u1", user: owner, companyId: "c1" }), "u1");
  assert.equal(creatorToFill({ data: { name: "S" }, authId: "u1", user: { role: "admin", companyId: "c1" }, companyId: "c1" }), "u1");
  assert.equal(creatorToFill({ data: { name: "S", createdByUid: "x" }, authId: "u1", user: owner, companyId: "c1" }), null);
  assert.equal(creatorToFill({ data: { name: "S", createdByUid: null }, authId: "u1", user: owner, companyId: "c1" }), null);
  assert.equal(creatorToFill({ data: { name: "S" }, authId: "u1", user: { role: "owner", companyId: "c2" }, companyId: "c1" }), null);
  assert.equal(creatorToFill({ data: { name: "S" }, authId: "u1", user: { role: "supervisor", companyId: "c1" }, companyId: "c1" }), null);
  assert.equal(creatorToFill({ data: { name: "S" }, authId: undefined, user: owner, companyId: "c1" }), null);
  assert.equal(creatorToFill({ data: { name: "S" }, authId: "u1", user: undefined, companyId: "c1" }), null);

  // the trigger itself
  const C = "fill-co";
  await db.doc("users/fill-owner").set({ role: "owner", companyId: C });
  const site = db.doc(`companies/${C}/jobSites/s1`);
  await site.set({ name: "Live website site", active: true });
  await funcs.fillJobSiteCreator.run({ data: { data: () => ({ name: "Live website site", active: true }) }, params: { companyId: C, siteId: "s1" }, authType: "unknown", authId: "fill-owner" });
  assert.equal((await site.get()).data().createdByUid, "fill-owner");
  // never over a value
  const site2 = db.doc(`companies/${C}/jobSites/s2`);
  await site2.set({ name: "B", active: true, createdByUid: "someone" });
  await funcs.fillJobSiteCreator.run({ data: { data: () => ({ name: "B", active: true, createdByUid: "someone" }) }, params: { companyId: C, siteId: "s2" }, authType: "unknown", authId: "fill-owner" });
  assert.equal((await site2.get()).data().createdByUid, "someone");
});
