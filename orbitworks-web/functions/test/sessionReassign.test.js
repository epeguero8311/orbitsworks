// Session review (Timesheet Approvals): reassignClockSession + the
// approved-session guard on correctClockEvent / reassignClockEvent.
// Part 1: the pure session walk / overlap check (sessionReassignValidators.ts).
// Part 2: the REAL compiled callables (lib/) on the Firestore emulator.
//
// Run: firebase emulators:exec --only firestore "node --test test/sessionReassign.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-session-reassign-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const v = require("../lib/sessionReassignValidators");
const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// ---------- Part 1: pure ----------

test("collectSessionEvents: clock-in through the next clock-out, breaks included", () => {
  const r = v.collectSessionEvents(
    [
      { id: "out", type: "out", ms: 800 },
      { id: "in", type: "in", ms: 100 },
      { id: "bs", type: "breakStart", ms: 300 },
      { id: "be", type: "breakEnd", ms: 350 },
      { id: "in2", type: "in", ms: 900 },
      { id: "out2", type: "out", ms: 1000 },
    ],
    "in"
  );
  assert.deepEqual(r, { ok: true, ids: ["in", "bs", "be", "out"], inMs: 100, outMs: 800 });
});

test("collectSessionEvents: open session, missing or non-clock-in id are refused", () => {
  assert.equal(v.collectSessionEvents([{ id: "in", type: "in", ms: 1 }, { id: "bs", type: "breakStart", ms: 2 }], "in").ok, false);
  assert.equal(v.collectSessionEvents([{ id: "in", type: "in", ms: 1 }, { id: "in2", type: "in", ms: 2 }, { id: "o", type: "out", ms: 3 }], "in").ok, false);
  assert.equal(v.collectSessionEvents([], "in").ok, false);
  assert.equal(v.collectSessionEvents([{ id: "o", type: "out", ms: 3 }], "o").ok, false);
});

test("findOverlap: touching neighbours are fine, overlaps and open sessions are not", () => {
  const target = [
    { id: "a", type: "in", ms: 0 },
    { id: "b", type: "out", ms: 100 },
  ];
  assert.equal(v.findOverlap(target, 101, 200), null);
  assert.deepEqual(v.findOverlap(target, 50, 200), { startMs: 100, endMs: 100 });
  assert.deepEqual(v.findOverlap(target, 10, 90), { startMs: 0, endMs: 100 });
  assert.deepEqual(v.findOverlap([{ id: "a", type: "in", ms: 0 }], 10, 90), { startMs: 0, endMs: null });
  assert.equal(v.findOverlap([{ id: "a", type: "in", ms: 500 }], 10, 90), null);
});

test("schema: trims, rejects blanks and long reasons", () => {
  assert.equal(v.reassignClockSessionSchema.safeParse({ clockInEventId: " a ", newEmployeeId: "b" }).data.clockInEventId, "a");
  assert.equal(v.reassignClockSessionSchema.safeParse({ clockInEventId: "", newEmployeeId: "b" }).success, false);
  assert.equal(v.reassignClockSessionSchema.safeParse({ clockInEventId: "a", newEmployeeId: "b", reason: "x".repeat(501) }).success, false);
});

// ---------- Part 2: the callables ----------

const C = "co-session";
const adminAuth = (c = C, role = "admin") => ({ uid: "admin-" + c, token: { role, companyId: c } });
const reassign = (data, auth = adminAuth()) => funcs.reassignClockSession.run({ data, auth, rawRequest: {} });
const correct = (data, auth = adminAuth()) => funcs.correctClockEvent.run({ data, auth, rawRequest: {} });
const reassignOne = (data, auth = adminAuth()) => funcs.reassignClockEvent.run({ data, auth, rawRequest: {} });

async function clearFirestore() {
  await fetch(
    `http://localhost:8090/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: "DELETE" }
  );
}

async function seed() {
  await clearFirestore();
  const base = Date.now() - 30 * HOUR;
  await db.doc(`companies/${C}`).set({ name: "Session Co" });
  await db.doc(`users/admin-${C}`).set({ name: "Ada", companyId: C, role: "admin" });
  for (const [id, name] of [["emp1", "Ann"], ["emp2", "Bob"], ["emp3", "Cy"]]) {
    await db.doc(`companies/${C}/employees/${id}`).set({ name, active: true, assignedSiteIds: [] });
  }
  await db.doc(`companies/${C}/employees/gone`).set({ name: "Gone", active: false, assignedSiteIds: [] });
  const ev = (id, employeeId, type, ms) =>
    db.doc(`companies/${C}/clockEvents/${id}`).set({
      employeeId, employeeName: employeeId, siteId: null, siteName: "", type, source: "pin",
      timestamp: admin.firestore.Timestamp.fromMillis(ms),
    });
  await ev("in1", "emp1", "in", base);
  await ev("bs1", "emp1", "breakStart", base + 3 * HOUR);
  await ev("be1", "emp1", "breakEnd", base + 3.5 * HOUR);
  await ev("out1", "emp1", "out", base + 8 * HOUR);
  // emp2 works later the same day - no overlap with emp1's session.
  await ev("in2", "emp2", "in", base + 9 * HOUR);
  await ev("out2", "emp2", "out", base + 12 * HOUR);
  // emp3 overlaps emp1's session.
  await ev("in3", "emp3", "in", base + 2 * HOUR);
  await ev("out3", "emp3", "out", base + 4 * HOUR);
  await db.doc(`companies/${C}/timesheetApprovals/in1`).set({ employeeId: "emp1", employeeName: "Ann", status: "pending", date: "x" });
  return base;
}

async function read(id) {
  return (await db.doc(`companies/${C}/clockEvents/${id}`).get()).data();
}

test("reassignClockSession: moves every event, audit-logged, approval follows", async () => {
  await seed();
  const res = await reassign({ clockInEventId: "in1", newEmployeeId: "emp2", reason: "wrong PIN" });
  assert.deepEqual(res.movedEventIds, ["in1", "bs1", "be1", "out1"]);
  for (const id of res.movedEventIds) {
    const d = await read(id);
    assert.equal(d.employeeId, "emp2");
    assert.equal(d.employeeName, "Bob");
    assert.equal(d.adjustmentHistory.length, 1);
    assert.equal(d.adjustmentHistory[0].fieldChanged, "employeeId");
    assert.equal(d.adjustmentHistory[0].previousValue, "emp1");
    assert.equal(d.adjustmentHistory[0].newValue, "Bob");
    assert.equal(d.adjustmentHistory[0].changedByName, "Ada");
    assert.equal(d.adjustmentHistory[0].reason, "wrong PIN");
  }
  const approval = (await db.doc(`companies/${C}/timesheetApprovals/in1`).get()).data();
  assert.equal(approval.employeeId, "emp2");
  assert.equal(approval.employeeName, "Bob");
  assert.equal((await read("in2")).employeeId, "emp2", "target's own events untouched");
});

test("reassignClockSession: overlap refuses and writes nothing", async () => {
  await seed();
  await assert.rejects(reassign({ clockInEventId: "in1", newEmployeeId: "emp3" }), (e) => {
    assert.equal(e.code, "failed-precondition");
    assert.match(e.message, /Cy already has time that overlaps/);
    return true;
  });
  for (const id of ["in1", "bs1", "be1", "out1"]) {
    assert.equal((await read(id)).employeeId, "emp1");
  }
});

test("reassignClockSession: approved, open, same/inactive employee, non-admin are refused", async () => {
  const base = await seed();
  await db.doc(`companies/${C}/timesheetApprovals/in1`).update({ status: "approved" });
  await assert.rejects(reassign({ clockInEventId: "in1", newEmployeeId: "emp2" }), /approved/);
  await db.doc(`companies/${C}/timesheetApprovals/in1`).update({ status: "pending" });
  await assert.rejects(reassign({ clockInEventId: "in1", newEmployeeId: "emp1" }), /already belongs/);
  await assert.rejects(reassign({ clockInEventId: "in1", newEmployeeId: "gone" }), /not active/);
  await assert.rejects(reassign({ clockInEventId: "out1", newEmployeeId: "emp2" }), /not a clock-in/);
  await assert.rejects(reassign({ clockInEventId: "in1", newEmployeeId: "emp2" }, adminAuth(C, "supervisor")), (e) => e.code === "permission-denied");
  await db.doc(`companies/${C}/clockEvents/inOpen`).set({
    employeeId: "emp1", employeeName: "emp1", type: "in", source: "pin", siteId: null, siteName: "",
    timestamp: admin.firestore.Timestamp.fromMillis(base + 20 * HOUR),
  });
  await assert.rejects(reassign({ clockInEventId: "inOpen", newEmployeeId: "emp2" }), /no clock-out yet/);
});

test("approved guard: Adjust time and single-event Change are refused on an approved session", async () => {
  const base = await seed();
  await db.doc(`companies/${C}/timesheetApprovals/in1`).update({ status: "approved" });
  await assert.rejects(correct({ eventId: "in1", newTimestamp: base - 10 * MIN }), /approved/);
  await assert.rejects(correct({ eventId: "be1", newTimestamp: base + 3.6 * HOUR }), /approved/);
  await assert.rejects(reassignOne({ eventId: "out1", newEmployeeId: "emp2" }), /approved/);
  assert.equal((await read("in1")).adjustedTimestamp, undefined);
  // Back to pending: allowed again.
  await db.doc(`companies/${C}/timesheetApprovals/in1`).update({ status: "pending" });
  await correct({ eventId: "be1", newTimestamp: base + 3.6 * HOUR });
  assert.equal((await read("be1")).adjustedTimestamp.toMillis(), base + 3.6 * HOUR);
});
