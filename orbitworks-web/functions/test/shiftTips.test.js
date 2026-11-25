// Tips (Task 3) - setShiftTip: tip + append-only tipEdits history on the
// timesheetApprovals doc, never touching approval state / frozen OT.
// Real compiled functions on the Firestore emulator.
// Run (from functions/): firebase emulators:exec --only firestore "node --test test/shiftTips.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-func-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const funcs = require("../lib/index.js");
const { db } = require("../lib/shared.js");

const ct = (day, hhmm) => Date.parse(`2026-11-${String(day).padStart(2, "0")}T${hhmm}:00-06:00`);

async function clearFirestore() {
  await fetch(`http://localhost:8090/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
}

const company = (c) => db.collection("companies").doc(c);
const auth = (c, role = "admin", uid = "admin-uid") => ({ uid, token: { role, companyId: c } });

async function seed(c, extra = {}) {
  await company(c).set({ name: c, tipsEnabled: true, overtimeEnabled: true, dailyOvertimeThreshold: 8, ...extra });
  await db.collection("users").doc("admin-uid").set({ name: "Ana Lopez" });
  await db.collection("users").doc("admin-2").set({ name: "Mark Diaz" });
}

async function clockIn(c, id, { approval = {} } = {}) {
  const base = { employeeId: "e1", employeeName: "Juan", siteId: null, siteName: "" };
  await company(c).collection("clockEvents").doc(id).set({ ...base, type: "in", timestamp: admin.firestore.Timestamp.fromMillis(ct(12, "07:00")) });
  if (approval) {
    await company(c).collection("timesheetApprovals").doc(id).set({
      employeeId: "e1",
      employeeName: "Juan",
      date: "2026-11-12",
      siteId: null,
      siteName: "",
      status: "pending",
      ...approval,
    });
  }
}

const approval = async (c, id) => (await company(c).collection("timesheetApprovals").doc(id).get()).data();
const edits = async (c, id) =>
  (await company(c).collection("timesheetApprovals").doc(id).collection("tipEdits").get()).docs
    .map((d) => d.data())
    .sort((a, b) => a.editedAt.toMillis() - b.editedAt.toMillis());
const setTip = (c, eventId, amountCents, a = auth(c)) =>
  funcs.setShiftTip.run({ data: { eventId, amountCents }, auth: a, rawRequest: {} });

test.beforeEach(clearFirestore);

test("saves the tip + one history entry per change, with the admin's server-side name", async () => {
  await seed("t1");
  await clockIn("t1", "s1");
  await setTip("t1", "s1", 4000, auth("t1", "admin", "admin-2"));
  await setTip("t1", "s1", 4500);
  const a = await approval("t1", "s1");
  assert.equal(a.tipCents, 4500);
  assert.equal(a.tipUpdatedByName, "Ana Lopez");
  assert.equal(a.tipUpdatedByUid, "admin-uid");
  assert.ok(a.tipUpdatedAt);
  const h = await edits("t1", "s1");
  assert.equal(h.length, 2);
  assert.deepEqual(
    h.map((e) => [e.amountCents, e.previousAmountCents, e.editedByName, e.companyId, e.clockInEventId]),
    [
      [4000, 0, "Mark Diaz", "t1", "s1"],
      [4500, 4000, "Ana Lopez", "t1", "s1"],
    ]
  );
});

test("same amount again is a no-op (no history entry)", async () => {
  await seed("t2");
  await clockIn("t2", "s1");
  await setTip("t2", "s1", 4500);
  const r = await setTip("t2", "s1", 4500);
  assert.equal(r.changed, false);
  assert.equal((await edits("t2", "s1")).length, 1);
  // $0 on a shift that never had a tip records nothing either.
  await clockIn("t2", "s2");
  await setTip("t2", "s2", 0);
  assert.equal((await edits("t2", "s2")).length, 0);
});

test("editing a tip never changes approval state, job, frozen OT or auto-break", async () => {
  await seed("t3");
  const frozen = {
    status: "approved",
    approvedByUid: "boss",
    approvedByName: "Boss",
    jobId: "foreman",
    jobName: "Foreman",
    autoBreakMinutesApplied: 30,
    autoBreakMinShiftHoursApplied: 6,
    overtimeApplied: { overtimeMinutes: 120, dailyOvertimeMinutes: 120, weeklyOvertimeMinutes: 0, workedMinutes: 600, settings: { multiplier: 1.5 } },
  };
  await clockIn("t3", "s1", { approval: frozen });
  const before = await approval("t3", "s1");
  await setTip("t3", "s1", 4500);
  await setTip("t3", "s1", 0);
  const after = await approval("t3", "s1");
  for (const k of Object.keys(frozen)) assert.deepEqual(after[k], before[k], k);
  assert.equal(after.tipCents, 0);
  assert.equal((await edits("t3", "s1")).length, 2);
});

test("older shift with no approval doc: self-heals it as pending", async () => {
  await seed("t4");
  await clockIn("t4", "s1", { approval: null });
  await setTip("t4", "s1", 1250);
  const a = await approval("t4", "s1");
  assert.equal(a.status, "pending");
  assert.equal(a.employeeId, "e1");
  assert.equal(a.tipCents, 1250);
});

test("refused: supervisor/employee, other company's shift, Tips OFF, bad amounts, unknown shift", async () => {
  await seed("t5");
  await seed("other");
  await clockIn("t5", "s1");
  await assert.rejects(setTip("t5", "s1", 100, auth("t5", "supervisor")), /Not authorized/);
  await assert.rejects(setTip("t5", "s1", 100, auth("t5", "employee")), /Not authorized/);
  await assert.rejects(funcs.setShiftTip.run({ data: { eventId: "s1", amountCents: 100 }, rawRequest: {} }), /signed in/);
  // Caller's claim decides the company: "s1" doesn't exist under "other".
  await assert.rejects(setTip("other", "s1", 100), /Shift not found/);
  for (const bad of [-1, 12.5, 100_001, "45", null]) {
    await assert.rejects(setTip("t5", "s1", bad), /\$1,000/);
  }
  await assert.rejects(setTip("t5", "nope", 100), /Shift not found/);
  await company("t5").set({ tipsEnabled: false }, { merge: true });
  await assert.rejects(setTip("t5", "s1", 100), /turned off/);
  assert.equal((await edits("t5", "s1")).length, 0);
  // Owner works the same as admin.
  await company("t5").set({ tipsEnabled: true }, { merge: true });
  await setTip("t5", "s1", 100_000, auth("t5", "owner"));
  assert.equal((await approval("t5", "s1")).tipCents, 100_000);
});

test("deleting the shift keeps the tip history (audit, D9)", async () => {
  await seed("t6");
  await clockIn("t6", "s1");
  await setTip("t6", "s1", 4500);
  await funcs.deleteTimesheetSession.run({ data: { eventIds: ["s1"], approvalId: "s1" }, auth: auth("t6"), rawRequest: {} });
  assert.equal(await approval("t6", "s1"), undefined);
  assert.equal((await edits("t6", "s1")).length, 1);
});
