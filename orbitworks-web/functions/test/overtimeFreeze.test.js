// Overtime (Task 1) step 8 - rule 11: OT frozen on a shift at approval
// (setApprovalStatus / setApprovalStatusBulk -> overtimeApplied on the
// timesheetApprovals doc). Real compiled functions on the Firestore emulator.
// Run (from functions/): firebase emulators:exec --only firestore "node --test test/overtimeFreeze.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-func-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const funcs = require("../lib/index.js");
const { db } = require("../lib/shared.js");

// Mon Nov 16 2026 is CST (UTC-6).
const ct = (day, hhmm) => Date.parse(`2026-11-${String(day).padStart(2, "0")}T${hhmm}:00-06:00`);

async function clearFirestore() {
  await fetch(`http://localhost:8090/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
}

const company = (c) => db.collection("companies").doc(c);
const auth = (c) => ({ uid: "admin-uid", token: { role: "admin", companyId: c } });

async function seed(c, extra = {}) {
  await company(c).set({ name: c, weeklyOvertimeThreshold: 40, overtimeEnabled: true, dailyOvertimeThreshold: 8, ...extra });
}

async function shift(c, id, day, from, to, { approve = null } = {}) {
  const base = { employeeId: "e1", employeeName: "Juan", siteId: null, siteName: "" };
  await company(c).collection("clockEvents").doc(id).set({ ...base, type: "in", timestamp: admin.firestore.Timestamp.fromMillis(ct(day, from)) });
  await company(c).collection("clockEvents").doc(`${id}-out`).set({ ...base, type: "out", timestamp: admin.firestore.Timestamp.fromMillis(ct(day, to)) });
  await company(c).collection("timesheetApprovals").doc(id).set({
    employeeId: "e1",
    employeeName: "Juan",
    date: `2026-11-${String(day).padStart(2, "0")}`,
    siteId: null,
    siteName: "",
    status: "pending",
    ...(approve ?? {}),
  });
}

const approval = async (c, id) => (await company(c).collection("timesheetApprovals").doc(id).get()).data();
const setStatus = (c, eventId, status) => funcs.setApprovalStatus.run({ data: { eventId, status }, auth: auth(c), rawRequest: {} });
const setBulk = (c, eventIds, status) => funcs.setApprovalStatusBulk.run({ data: { eventIds, status }, auth: auth(c), rawRequest: {} });

test.beforeEach(clearFirestore);

test("approve freezes the shift's OT + a settings snapshot; back to pending clears it", async () => {
  await seed("fz1");
  await shift("fz1", "mon", 16, "07:00", "17:00"); // 10h, daily 8 -> 2h
  await setStatus("fz1", "mon", "approved");
  const a = await approval("fz1", "mon");
  assert.equal(a.status, "approved");
  assert.equal(a.overtimeApplied.overtimeMinutes, 120);
  assert.equal(a.overtimeApplied.dailyOvertimeMinutes, 120);
  assert.equal(a.overtimeApplied.workedMinutes, 600);
  assert.deepEqual(a.overtimeApplied.settings, {
    weeklyThresholdHours: 40,
    dailyThresholdHours: 8,
    weekStartsOn: 1,
    multiplier: 1.5,
    roundOvertimeMinutes: 0,
    timeZone: "America/Chicago",
  });
  await setStatus("fz1", "mon", "pending");
  assert.equal((await approval("fz1", "mon")).overtimeApplied, undefined);
});

test("approving with Overtime OFF freezes nothing", async () => {
  await seed("fz2", { overtimeEnabled: false });
  await shift("fz2", "mon", 16, "07:00", "17:00");
  await setStatus("fz2", "mon", "approved");
  const a = await approval("fz2", "mon");
  assert.equal(a.status, "approved");
  assert.equal(a.overtimeApplied, undefined);
});

test("bulk: weekly OT lands on the crossing shift, unapproved earlier days still count", async () => {
  await seed("fz3", { dailyOvertimeThreshold: 0 });
  for (const d of [16, 17, 18, 19]) await shift("fz3", `d${d}`, d, "07:00", "16:00"); // 9h x 4 = 36
  await shift("fz3", "fri", 20, "07:00", "16:00"); // 45 -> 5h OT on Fri
  await setBulk("fz3", ["d18", "fri"], "approved"); // Mon/Tue/Thu stay pending
  assert.equal((await approval("fz3", "d18")).overtimeApplied.overtimeMinutes, 0);
  assert.equal((await approval("fz3", "fri")).overtimeApplied.overtimeMinutes, 300);
  assert.equal((await approval("fz3", "d16")).overtimeApplied, undefined);
});

test("frozen OT doesn't move when settings change later", async () => {
  await seed("fz4");
  await shift("fz4", "mon", 16, "07:00", "17:00");
  await setStatus("fz4", "mon", "approved");
  await company("fz4").set({ dailyOvertimeThreshold: 6 }, { merge: true });
  assert.equal((await approval("fz4", "mon")).overtimeApplied.overtimeMinutes, 120);
});

test("an already-approved shift's frozen Automatic Break is used for the week", async () => {
  await seed("fz5", { exportSettings: { automaticBreakMinutes: 60, minimumShiftHours: 0 } });
  // Approved earlier with NO automatic break frozen on it: 9h worked.
  await shift("fz5", "mon", 16, "07:00", "16:00", {
    approve: { status: "approved", autoBreakMinutesApplied: 0, autoBreakMinShiftHoursApplied: 0 },
  });
  await shift("fz5", "tue", 17, "07:00", "17:00"); // 10h - 60 min live auto break = 9h -> 1h daily OT
  await setStatus("fz5", "tue", "approved");
  const tue = await approval("fz5", "tue");
  assert.equal(tue.overtimeApplied.workedMinutes, 540);
  assert.equal(tue.overtimeApplied.overtimeMinutes, 60);
});

test("decision 4B: rate + OT rate frozen with the Approve Hours job, else the default job", async () => {
  await seed("fz6");
  await company("fz6").collection("jobs").doc("laborer").set({ name: "Laborer", hourlyRate: 15, active: true });
  await company("fz6").collection("jobs").doc("foreman").set({ name: "Foreman", hourlyRate: 23, overtimeRate: 40, active: true });
  await company("fz6").collection("employees").doc("e1").set({ name: "Juan", active: true, jobId: "laborer" });
  await shift("fz6", "mon", 16, "07:00", "17:00");
  await shift("fz6", "tue", 17, "07:00", "17:00");
  await setStatus("fz6", "mon", "approved"); // default job
  await funcs.setApprovalStatus.run({ data: { eventId: "tue", status: "approved", jobId: "foreman" }, auth: auth("fz6"), rawRequest: {} });
  const mon = (await approval("fz6", "mon")).overtimeApplied;
  const tue = (await approval("fz6", "tue")).overtimeApplied;
  assert.deepEqual([mon.jobId, mon.rate, mon.overtimeRate], ["laborer", 15, 22.5]);
  assert.deepEqual([tue.jobId, tue.rate, tue.overtimeRate], ["foreman", 23, 40]);
  // A later raise doesn't move the frozen rate.
  await company("fz6").collection("jobs").doc("foreman").set({ hourlyRate: 30 }, { merge: true });
  assert.equal((await approval("fz6", "tue")).overtimeApplied.rate, 23);
});

test("decision 4B: subcontractor OT rate = straight rate; bulk keeps each row's picked job", async () => {
  await seed("fz7");
  await company("fz7").collection("jobs").doc("foreman").set({ name: "Foreman", hourlyRate: 23, overtimeRate: 40, active: true });
  await company("fz7").collection("employees").doc("e1").set({ name: "Juan", active: true, jobId: null, hourlyRate: 18, subcontractorId: "sub1" });
  await shift("fz7", "mon", 16, "07:00", "17:00");
  await shift("fz7", "tue", 17, "07:00", "17:00");
  await funcs.setApprovalStatusBulk.run({
    data: { eventIds: ["mon", "tue"], status: "approved", jobIdByEventId: { tue: "foreman" } },
    auth: auth("fz7"),
    rawRequest: {},
  });
  const mon = (await approval("fz7", "mon")).overtimeApplied;
  const tue = (await approval("fz7", "tue")).overtimeApplied;
  assert.deepEqual([mon.jobId, mon.rate, mon.overtimeRate], [null, 18, 18]);
  assert.deepEqual([tue.jobId, tue.rate, tue.overtimeRate], ["foreman", 23, 23]);
});
