// RC1 follow-up - reportRemovedItem (functions/src/employeeRemovedItems.ts):
// the phone reports an unsent punch / shift comment the employee removed,
// the admin gets one punchRemoved alert. Runs the REAL compiled callable
// (lib/) on the Firestore emulator. Each test uses its own company.
//
// Run: firebase emulators:exec --only firestore "node --test test/employeeRemovedItems.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-removed-test";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");
const { MAX_REMOVED_ALERTS_PER_DAY } = require("../lib/removedItemTypes.js");

const MIN = 60 * 1000;
const auth = (c, role = "employee", uid = "uid1", employeeId = "emp1") => ({ uid, token: { role, companyId: c, employeeId } });
const call = (data, a) => funcs.reportRemovedItem.run({ data, auth: a, rawRequest: {} });

async function seed(c, extra = {}) {
  await db.doc(`companies/${c}`).set({ name: "Co " + c });
  await db.doc(`companies/${c}/employees/emp1`).set({ name: "Ana Diaz", active: true, linkedUserId: "uid1", appAccess: true, ...extra });
}

const punchReport = (o = {}) => ({
  requestId: randomUUID(),
  kind: "punch",
  action: "in",
  madeAtMs: Date.now() - 30 * MIN,
  removedAtMs: Date.now() - MIN,
  failMessage: "Your PIN was wrong.",
  ...o,
});

async function alertsOf(c) {
  const snap = await db.collection(`companies/${c}/alerts`).where("alertType", "==", "punchRemoved").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

test("removed punch: one warning alert for the admin, keyed by the punch, saying it was never recorded", async () => {
  const c = "rm-punch";
  await seed(c);
  const r = punchReport();
  assert.deepEqual(await call(r, auth(c)), { ok: true, alerted: true });
  const [alert, ...rest] = await alertsOf(c);
  assert.equal(rest.length, 0);
  assert.ok(alert.id.startsWith(`removed-${r.requestId}-`));
  assert.equal(alert.severity, "warning");
  assert.equal(alert.employeeId, "emp1");
  assert.equal(alert.employeeName, "Ana Diaz");
  assert.equal(alert.eventId, r.requestId);
  assert.match(alert.message, /^Ana Diaz removed an unsent clock-in from .+ It was never recorded - fix their time by hand\. It couldn't be sent: Your PIN was wrong\.$/);
});

test("removed comment: the alert carries the lost text", async () => {
  const c = "rm-comment";
  await seed(c);
  const r = { requestId: randomUUID(), kind: "comment", madeAtMs: Date.now() - 10 * MIN, removedAtMs: Date.now(), clockEventId: randomUUID(), note: "Truck broke down, left at 2" };
  assert.equal((await call(r, auth(c))).alerted, true);
  const [alert] = await alertsOf(c);
  assert.match(alert.message, /removed an unsent shift comment from .+\. "Truck broke down, left at 2" It was never saved\.$/);
});

test("a resend (the phone lost the answer) makes no second alert", async () => {
  const c = "rm-resend";
  await seed(c);
  const r = punchReport({ action: "out" });
  assert.equal((await call(r, auth(c))).alerted, true);
  assert.deepEqual(await call(r, auth(c)), { ok: true, alerted: false });
  assert.equal((await alertsOf(c)).length, 1);
});

test("nothing lost after all (the event / comment is on the server): no alert", async () => {
  const c = "rm-landed";
  await seed(c);
  const p = punchReport();
  await db.doc(`companies/${c}/clockEvents/${p.requestId}`).set({ employeeId: "emp1", type: "in" });
  assert.deepEqual(await call(p, auth(c)), { ok: true, alerted: false });
  const cm = { requestId: randomUUID(), kind: "comment", madeAtMs: Date.now() - MIN, removedAtMs: Date.now(), clockEventId: randomUUID() };
  await db.doc(`companies/${c}/shiftNotes/${cm.requestId}`).set({ employeeId: "emp1", note: "x" });
  assert.deepEqual(await call(cm, auth(c)), { ok: true, alerted: false });
  assert.equal((await alertsOf(c)).length, 0);
});

test("removed on the phone, then promoted: the supervisor/admin login still sends its own report", async () => {
  const c = "rm-promoted";
  await seed(c);
  assert.equal((await call(punchReport(), auth(c, "supervisor"))).alerted, true);
  assert.equal((await call(punchReport({ action: "breakStart" }), auth(c, "admin"))).alerted, true);
  assert.equal((await alertsOf(c)).length, 2);
});

test("FAIL: wrong login - unlinked, someone else's employeeId, owner, promoted without app access, bad input", async () => {
  const c = "rm-refused";
  await seed(c);
  await db.doc(`companies/${c}/employees/emp2`).set({ name: "Ben", active: true, linkedUserId: "uid2" });
  await assert.rejects(call(punchReport(), auth(c, "employee", "uid1", "emp2")), /no longer linked/);
  await assert.rejects(call(punchReport(), auth(c, "employee", "uid-x")), /no longer linked/);
  await assert.rejects(call(punchReport(), auth(c, "owner")), /Only an employee app login/);
  await assert.rejects(call(punchReport(), { uid: "uid1", token: { role: "employee", companyId: c } }), /Only an employee app login/);
  await assert.rejects(call(punchReport(), undefined), /signed in/);
  await assert.rejects(call(punchReport({ action: undefined }), auth(c)), /Invalid removal report/);
  await db.doc(`companies/${c}/employees/emp1`).update({ appAccess: false });
  await assert.rejects(call(punchReport(), auth(c, "supervisor")), /no longer linked/);
  assert.equal((await alertsOf(c)).length, 0);
});

test("a flood is capped per employee per day (accepted, no more alerts)", async () => {
  const c = "rm-cap";
  await seed(c);
  const madeAtMs = Date.now() - 5 * MIN;
  for (let i = 0; i < MAX_REMOVED_ALERTS_PER_DAY; i++) {
    assert.equal((await call(punchReport({ madeAtMs }), auth(c))).alerted, true);
  }
  assert.deepEqual(await call(punchReport({ madeAtMs }), auth(c)), { ok: true, alerted: false });
  assert.equal((await alertsOf(c)).length, MAX_REMOVED_ALERTS_PER_DAY);
});
