// Phase 7 - employee push token calls, the employee's own alerts from the
// periodic sweep (shift ending, still clocked in, max hours incl.
// overnight, overtime - each on/off by the company's own toggle), the push
// to the employee, and the 90-day cleanup. Real compiled functions against
// the Firestore emulator; only Expo's network call is stubbed.
// Run (from functions/): firebase emulators:exec --only firestore "node --test test/employeeAlerts.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-func-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Expo } = require("expo-server-sdk");
const admin = require("firebase-admin");

let sent = [];
let sendPushImpl = async (messages) => messages.map(() => ({ status: "ok" }));
Expo.prototype.sendPushNotificationsAsync = async (messages) => {
  sent.push(...messages);
  return sendPushImpl(messages);
};

const funcs = require("../lib/index.js");
const employeeAlerts = require("../lib/employeeAlerts.js");
const { db } = require("../lib/shared.js");

const TOKEN_A = "ExponentPushToken[phoneAaaaaaaaaaaaaaaaaa]";
const TOKEN_B = "ExponentPushToken[phoneBbbbbbbbbbbbbbbbbbb]";
const HOUR = 60 * 60 * 1000;
// 2026-10-21 is CDT (UTC-5).
const at = (hhmm, day = "2026-10-21") => Date.parse(`${day}T${hhmm}:00-05:00`);

// Every test uses its own company id: under emulators:exec the admin SDK can
// use another project id than this clear call, so data may survive it.
async function clearFirestore() {
  await fetch(`http://localhost:8090/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
}

function setFlags({ alertsFeed = true, pushEnabled = true } = {}) {
  process.env.ALERTS_FEED_ENABLED = String(alertsFeed);
  process.env.PUSH_NOTIFICATIONS_ENABLED = String(pushEnabled);
  delete process.env.TEST_COMPANY_IDS;
}

const company = (c) => db.collection("companies").doc(c);

async function seedCompany(c, alerts = {}, extra = {}) {
  await company(c).set({
    businessHours: { open: "08:00", close: "17:00" },
    attendanceRules: { gracePeriodMinutes: 0 },
    weeklyOvertimeThreshold: 40,
    alerts: {
      maxHoursWarning: true,
      maxHoursThreshold: 8,
      overtimeWarning: true,
      missedClockOutAlert: true,
      missedClockOutMinutes: 30,
      maxBreakWarning: true,
      maxBreakMinutes: 15,
      lateClockInAlert: false,
      earlyClockOutAlert: false,
      ...alerts,
    },
    ...extra,
  });
}

async function seedEmployee(c, id, { uid = `uid-${id}`, linked = true } = {}) {
  await company(c).collection("employees").doc(id).set({ name: id, active: true, ...(linked ? { linkedUserId: uid } : {}) });
}

async function addEvent(c, employeeId, type, ms) {
  const ref = await company(c).collection("clockEvents").add({
    employeeId,
    employeeName: employeeId,
    siteId: null,
    siteName: null,
    type,
    timestamp: admin.firestore.Timestamp.fromMillis(ms),
  });
  return ref.id;
}

async function employeeAlertsOf(c, alertType) {
  const snap = await company(c).collection("employeeAlerts").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => !alertType || a.alertType === alertType);
}

const auth = (c, employeeId, uid = `uid-${employeeId}`) => ({ uid, token: { role: "employee", companyId: c, employeeId } });
const register = (c, employeeId, data, uid) =>
  funcs.registerEmployeePushToken.run({ data, auth: auth(c, employeeId, uid), rawRequest: {} });
const clear = (c, employeeId, data) => funcs.clearEmployeePushToken.run({ data, auth: auth(c, employeeId), rawRequest: {} });
const tokenDoc = (c, employeeId) => company(c).collection("employeePushTokens").doc(employeeId).get();

async function sweepAt(t, ms) {
  t.mock.timers.enable({ apis: ["Date"], now: ms });
  await funcs.checkPeriodicAlerts.run({});
}

test.beforeEach(async () => {
  await clearFirestore();
  setFlags();
  sent = [];
  sendPushImpl = async (messages) => messages.map(() => ({ status: "ok" }));
});

// ===================== token: register / clear =====================

test("register saves this phone's token on the employee's own server-only doc", async () => {
  await seedEmployee("c-reg1", "empA");
  const res = await register("c-reg1", "empA", { token: TOKEN_A, platform: "ios" });
  assert.equal(res.ok, true);
  const d = (await tokenDoc("c-reg1", "empA")).data();
  assert.equal(d.token, TOKEN_A);
  assert.equal(d.platform, "ios");
  assert.equal(d.employeeId, "empA");
  assert.ok(d.updatedAt);
});

test("register again with a new token replaces it (token refresh)", async () => {
  await seedEmployee("c-reg2", "empA");
  await register("c-reg2", "empA", { token: TOKEN_A, platform: "ios" });
  await register("c-reg2", "empA", { token: TOKEN_B, platform: "ios" });
  assert.equal((await tokenDoc("c-reg2", "empA")).data().token, TOKEN_B);
});

test("shared phone: the same token moves to the new employee, off the old one and off supervisor pushTokens (any company)", async () => {
  await seedEmployee("c-sp1", "empA");
  await seedEmployee("c-sp1", "empB");
  await seedEmployee("c-sp2", "empX");
  await register("c-sp1", "empA", { token: TOKEN_A, platform: "ios" });
  await register("c-sp2", "empX", { token: TOKEN_A, platform: "ios" }); // moved to another company
  await company("c-sp1").collection("pushTokens").doc("dev1").set({ deviceId: "dev1", token: TOKEN_A, platform: "ios", notificationsEnabled: true });
  await company("c-sp1").collection("pushTokens").doc("dev2").set({ deviceId: "dev2", token: TOKEN_B, platform: "ios", notificationsEnabled: true });
  await company("c-sp1").collection("employeePushTokens").doc("empB").set({ employeeId: "empB", token: TOKEN_B, platform: "ios" });

  const res = await register("c-sp1", "empA", { token: TOKEN_A, platform: "ios" });

  assert.equal(res.removed, 2);
  assert.equal((await tokenDoc("c-sp1", "empA")).data().token, TOKEN_A);
  assert.equal((await tokenDoc("c-sp2", "empX")).exists, false);
  assert.equal((await company("c-sp1").collection("pushTokens").doc("dev1").get()).exists, false);
  // Other phones' tokens are untouched.
  assert.equal((await company("c-sp1").collection("pushTokens").doc("dev2").get()).exists, true);
  assert.equal((await tokenDoc("c-sp1", "empB")).data().token, TOKEN_B);
});

test("register refuses: not an employee login, stale link, bad input", async () => {
  await seedEmployee("c-ref", "empA");
  await assert.rejects(
    funcs.registerEmployeePushToken.run({ data: { token: TOKEN_A, platform: "ios" }, auth: null, rawRequest: {} }),
    (e) => e.code === "unauthenticated"
  );
  await assert.rejects(
    funcs.registerEmployeePushToken.run({
      data: { token: TOKEN_A, platform: "ios" },
      auth: { uid: "sup", token: { role: "supervisor", companyId: "c-ref", employeeId: "empA" } },
      rawRequest: {},
    }),
    (e) => e.code === "permission-denied"
  );
  await assert.rejects(register("c-ref", "empA", { token: TOKEN_A, platform: "ios" }, "someone-else"), (e) => e.code === "permission-denied");
  await assert.rejects(register("c-ref", "empA", { token: "nope", platform: "ios" }), (e) => e.code === "invalid-argument");
  await assert.rejects(register("c-ref", "empA", { token: TOKEN_A, platform: "ios", employeeId: "empB" }), (e) => e.code === "invalid-argument");
  assert.equal((await tokenDoc("c-ref", "empA")).exists, false);
});

test("clear (sign-out) removes the token only if it is still this phone's", async () => {
  await seedEmployee("c-clr", "empA");
  await register("c-clr", "empA", { token: TOKEN_B, platform: "ios" }); // signed in on phone B since
  const stale = await clear("c-clr", "empA", { token: TOKEN_A }); // sign-out on old phone A
  assert.equal(stale.cleared, false);
  assert.equal((await tokenDoc("c-clr", "empA")).data().token, TOKEN_B);
  const res = await clear("c-clr", "empA", { token: TOKEN_B });
  assert.equal(res.cleared, true);
  assert.equal((await tokenDoc("c-clr", "empA")).exists, false);
  const again = await clear("c-clr", "empA", { token: TOKEN_B });
  assert.equal(again.cleared, false);
});

// ===================== sweep: employee alerts =====================

async function openShift(c, employeeId, clockInMs) {
  await seedEmployee(c, employeeId);
  await register(c, employeeId, { token: TOKEN_A, platform: "ios" });
  return addEvent(c, employeeId, "in", clockInMs);
}

test("shift ending: fires once at 4:45 PM with the reason, pushed to the employee", async (t) => {
  await seedCompany("c-se");
  const inId = await openShift("c-se", "e1", at("08:00"));
  await sweepAt(t, at("16:45"));
  await funcs.checkPeriodicAlerts.run({}); // second run, same window
  const alerts = await employeeAlertsOf("c-se", "shiftEnding");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, `shiftEnding-${inId}`);
  assert.equal(alerts[0].employeeId, "e1");
  assert.equal(alerts[0].shiftId, inId);
  assert.equal(alerts[0].title, "Shift ending soon");
  assert.match(alerts[0].reason, /15 minutes before/);
  const push = sent.filter((m) => m.data?.alertType === "shiftEnding");
  assert.equal(push.length, 1);
  assert.equal(push[0].to, TOKEN_A);
  assert.equal(push[0].data.employeeAlertId, `shiftEnding-${inId}`);
  assert.equal(push[0].sound, "default");
});

test("shift ending: not before 4:45, not for a shift started after close, not with no close time", async (t) => {
  await seedCompany("c-se2");
  await openShift("c-se2", "e1", at("08:00"));
  await sweepAt(t, at("16:30"));
  assert.equal((await employeeAlertsOf("c-se2", "shiftEnding")).length, 0);

  await seedCompany("c-se3", {}, { businessHours: { open: "08:00" } }); // no close set
  await openShift("c-se3", "e1", at("08:00"));
  await funcs.checkPeriodicAlerts.run({});
  t.mock.timers.setTime(at("16:50"));
  await funcs.checkPeriodicAlerts.run({});
  assert.equal((await employeeAlertsOf("c-se3")).filter((a) => a.alertType !== "maxHours").length, 0);
});

test("still clocked in: once per shift at close + the company's delay", async (t) => {
  await seedCompany("c-sci", { missedClockOutMinutes: 45 });
  const inId = await openShift("c-sci", "e1", at("08:00"));
  await sweepAt(t, at("17:30"));
  assert.equal((await employeeAlertsOf("c-sci", "stillClockedIn")).length, 0);
  t.mock.timers.setTime(at("17:45"));
  await funcs.checkPeriodicAlerts.run({});
  t.mock.timers.setTime(at("18:00"));
  await funcs.checkPeriodicAlerts.run({});
  const alerts = await employeeAlertsOf("c-sci", "stillClockedIn");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, `stillClockedIn-${inId}`);
  assert.match(alerts[0].reason, /45 minutes later/);
  assert.equal(sent.filter((m) => m.data?.alertType === "stillClockedIn").length, 1);
});

test("Missed clock out alert OFF: no shift ending and no still clocked in", async (t) => {
  await seedCompany("c-off-mco", { missedClockOutAlert: false });
  await openShift("c-off-mco", "e1", at("08:00"));
  await sweepAt(t, at("16:50"));
  t.mock.timers.setTime(at("17:45"));
  await funcs.checkPeriodicAlerts.run({});
  const types = (await employeeAlertsOf("c-off-mco")).map((a) => a.alertType);
  assert.ok(!types.includes("shiftEnding"));
  assert.ok(!types.includes("stillClockedIn"));
});

test("max hours: employee gets one per shift; overnight shift counts; supervisor alert too", async (t) => {
  await seedCompany("c-mh");
  const inId = await openShift("c-mh", "e1", at("23:30", "2026-10-20"));
  await sweepAt(t, at("08:00"));
  await funcs.checkPeriodicAlerts.run({});
  const mine = await employeeAlertsOf("c-mh", "maxHours");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, `maxHours-${inId}`);
  assert.equal(mine[0].message, "You have worked 8.5 hours this shift.");
  const sup = await company("c-mh").collection("alerts").where("alertType", "==", "maxHours").get();
  assert.deepEqual(sup.docs.map((d) => d.id), ["max-e1-2026-10-20"]);
});

test("max hours OFF: no employee or supervisor max hours alert", async (t) => {
  await seedCompany("c-mh-off", { maxHoursWarning: false });
  await openShift("c-mh-off", "e1", at("06:00"));
  await sweepAt(t, at("15:00"));
  assert.equal((await employeeAlertsOf("c-mh-off", "maxHours")).length, 0);
});

test("overtime: employee gets one per week; OFF = none", async (t) => {
  await seedCompany("c-ot", {}, { weeklyOvertimeThreshold: 1 });
  await openShift("c-ot", "e1", at("08:00"));
  await sweepAt(t, at("11:00"));
  await funcs.checkPeriodicAlerts.run({});
  const ot = await employeeAlertsOf("c-ot", "overtime");
  assert.equal(ot.length, 1);
  // Week key comes from the sweep's own week start (same as the supervisor overtime alert).
  const supOt = await company("c-ot").collection("alerts").where("alertType", "==", "overtime").get();
  assert.equal(ot[0].id, `overtime-e1-${supOt.docs[0].data().dateKey}`);
  assert.equal(ot[0].shiftId, null);
  assert.match(ot[0].reason, /1 hours/);

  await seedCompany("c-ot-off", { overtimeWarning: false }, { weeklyOvertimeThreshold: 1 });
  await openShift("c-ot-off", "e1", at("08:00"));
  await funcs.checkPeriodicAlerts.run({});
  assert.equal((await employeeAlertsOf("c-ot-off", "overtime")).length, 0);
});

test("alerts feed kill switch OFF: no employee alerts at all", async (t) => {
  setFlags({ alertsFeed: false });
  await seedCompany("c-kill");
  await openShift("c-kill", "e1", at("06:00"));
  await sweepAt(t, at("16:50"));
  assert.equal((await employeeAlertsOf("c-kill")).length, 0);
});

test("employee with no app login: no employee alert doc (supervisor alert still made)", async (t) => {
  await seedCompany("c-nolink");
  await seedEmployee("c-nolink", "e1", { linked: false });
  await addEvent("c-nolink", "e1", "in", at("06:00"));
  await sweepAt(t, at("15:00"));
  assert.equal((await employeeAlertsOf("c-nolink")).length, 0);
  assert.equal((await company("c-nolink").collection("alerts").where("alertType", "==", "maxHours").get()).size, 1);
});

test("push OFF: the alert is still saved for the Alerts tab, nothing is sent", async (t) => {
  setFlags({ pushEnabled: false });
  await seedCompany("c-nopush");
  await openShift("c-nopush", "e1", at("06:00"));
  await sweepAt(t, at("15:00"));
  assert.equal((await employeeAlertsOf("c-nopush", "maxHours")).length, 1);
  assert.equal(sent.length, 0);
});

test("no token (permission denied / signed out): alert saved, no push", async (t) => {
  await seedCompany("c-notoken");
  await seedEmployee("c-notoken", "e1");
  await addEvent("c-notoken", "e1", "in", at("06:00"));
  await sweepAt(t, at("15:00"));
  assert.equal((await employeeAlertsOf("c-notoken", "maxHours")).length, 1);
  assert.equal(sent.filter((m) => m.data?.employeeAlertId).length, 0);
});

test("push send throws: alert still saved, the sweep never throws", async (t) => {
  await seedCompany("c-throw");
  await openShift("c-throw", "e1", at("06:00"));
  sendPushImpl = async () => {
    throw new Error("Expo down");
  };
  t.mock.timers.enable({ apis: ["Date"], now: at("15:00") });
  await assert.doesNotReject(funcs.checkPeriodicAlerts.run({}));
  assert.equal((await employeeAlertsOf("c-throw", "maxHours")).length, 1);
  assert.equal((await tokenDoc("c-throw", "e1")).exists, true);
});

test("DeviceNotRegistered: the employee's stale token is removed", async () => {
  await seedEmployee("c-stale", "e1");
  await register("c-stale", "e1", { token: TOKEN_A, platform: "ios" });
  sendPushImpl = async (messages) => messages.map(() => ({ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }));
  const wrote = await employeeAlerts.sendEmployeeAlert({
    companyId: "c-stale",
    employeeId: "e1",
    key: "k1",
    shiftId: null,
    alertType: "overtime",
    title: "Overtime",
    message: "m",
    reason: "r",
  });
  assert.equal(wrote, true);
  assert.equal((await tokenDoc("c-stale", "e1")).exists, false);
});

test("sendEmployeeAlert is idempotent: same type + key = one doc, one push", async () => {
  await seedEmployee("c-idem", "e1");
  await register("c-idem", "e1", { token: TOKEN_A, platform: "ios" });
  const input = { companyId: "c-idem", employeeId: "e1", key: "k", shiftId: null, alertType: "overtime", title: "t", message: "m", reason: "r" };
  assert.equal(await employeeAlerts.sendEmployeeAlert(input), true);
  assert.equal(await employeeAlerts.sendEmployeeAlert(input), false);
  assert.equal((await employeeAlertsOf("c-idem")).length, 1);
  assert.equal(sent.length, 1);
});

// ===================== cleanup =====================

test("cleanup deletes employee alerts older than 90 days only", async () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const col = company("c-clean").collection("employeeAlerts");
  await company("c-clean").set({ name: "x" });
  const ts = (days) => admin.firestore.Timestamp.fromMillis(now - days * 24 * HOUR);
  await col.doc("old").set({ employeeId: "e1", createdAt: ts(91) });
  await col.doc("edge").set({ employeeId: "e1", createdAt: ts(89) });
  await col.doc("new").set({ employeeId: "e1", createdAt: ts(1) });
  const deleted = await employeeAlerts.cleanupEmployeeAlertsRun(now);
  assert.equal(deleted, 1);
  assert.deepEqual((await col.get()).docs.map((d) => d.id).sort(), ["edge", "new"]);
});
