// correctClockEvent (admin "Adjust time") - prod-readiness blocker B8.
// Part 1: the pure order check (clockCorrectionValidators.ts).
// Part 2: the REAL compiled callable (lib/) on the Firestore emulator.
//
// Run: firebase emulators:exec --only firestore "node --test test/clockCorrection.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-correction-test";
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

const v = require("../lib/clockCorrectionValidators");
const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// ---------- Part 1: pure ----------

const shift = (base) => [
  { id: "in", type: "in", ms: base },
  { id: "bs", type: "breakStart", ms: base + 3 * HOUR },
  { id: "be", type: "breakEnd", ms: base + 3.5 * HOUR },
  { id: "out", type: "out", ms: base + 8 * HOUR },
];

test("order: a move that stays between the neighbours passes", () => {
  const ev = shift(0);
  assert.equal(v.findCorrectionConflict(ev, "in", 0, -2 * HOUR), null);
  assert.equal(v.findCorrectionConflict(ev, "in", 0, 2 * HOUR), null);
  assert.equal(v.findCorrectionConflict(ev, "out", 8 * HOUR, 4 * HOUR), null);
  assert.equal(v.findCorrectionConflict(ev, "out", 8 * HOUR, 30 * HOUR), null);
});

test("order: clock-in moved after its break start / clock-out is refused", () => {
  const ev = shift(0);
  const c1 = v.findCorrectionConflict(ev, "in", 0, 3 * HOUR);
  assert.equal(c1.side, "after");
  assert.equal(c1.neighbour.id, "bs");
  const c2 = v.findCorrectionConflict(ev, "in", 0, 9 * HOUR);
  assert.equal(c2.neighbour.id, "bs");
});

test("order: clock-out moved before the break end is refused, equal time too", () => {
  const ev = shift(0);
  const c = v.findCorrectionConflict(ev, "out", 8 * HOUR, 3.5 * HOUR);
  assert.equal(c.side, "before");
  assert.equal(c.neighbour.id, "be");
  assert.match(v.correctionConflictMessage("out", c), /clock-out has to stay after the break end/);
});

test("order: the previous shift counts - a clock-in can't go before yesterday's clock-out", () => {
  const ev = [...shift(-24 * HOUR).map((e) => ({ ...e, id: "y-" + e.id })), ...shift(0)];
  const c = v.findCorrectionConflict(ev, "in", 0, -20 * HOUR);
  assert.equal(c.side, "before");
  assert.equal(c.neighbour.id, "y-out");
  assert.equal(v.findCorrectionConflict(ev, "in", 0, -15 * HOUR), null);
});

test("order: the only event ever, or bad neighbour times, never block", () => {
  assert.equal(v.findCorrectionConflict([{ id: "in", type: "in", ms: 0 }], "in", 0, -999 * HOUR), null);
  assert.equal(v.findCorrectionConflict([{ id: "x", type: "out", ms: NaN }], "in", 0, 5 * HOUR), null);
});

test("schema: exactly what the live website sends parses; junk is refused", () => {
  const ok = v.correctClockEventSchema.safeParse({ eventId: "e1", newTimestamp: 1760000000000 });
  assert.ok(ok.success);
  assert.equal(ok.data.reason, undefined);
  const withReason = v.correctClockEventSchema.safeParse({ eventId: " e1 ", newTimestamp: 1760000000000, reason: "  forgot  " });
  assert.equal(withReason.data.eventId, "e1");
  assert.equal(withReason.data.reason, "forgot");
  assert.equal(v.correctClockEventSchema.safeParse({ eventId: "e1", newTimestamp: 1760000000000, reason: "   " }).data.reason, undefined);
  for (const bad of [
    {},
    { eventId: "", newTimestamp: 1 },
    { eventId: "e1" },
    { eventId: "e1", newTimestamp: "1760000000000" },
    { eventId: "e1", newTimestamp: Infinity },
    { eventId: "e1", newTimestamp: NaN },
    { eventId: "e1", newTimestamp: 1.5 },
    { eventId: "e1", newTimestamp: -5 },
    { eventId: "e1", newTimestamp: 1, reason: "x".repeat(501) },
  ]) {
    assert.equal(v.correctClockEventSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

// ---------- Part 2: the callable ----------

const C = "co-correct";
const adminAuth = (c = C, role = "admin") => ({ uid: "admin-" + c, token: { role, companyId: c } });
const call = (data, auth = adminAuth()) => funcs.correctClockEvent.run({ data, auth, rawRequest: {} });

async function clearFirestore() {
  await fetch(
    `http://localhost:8090/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: "DELETE" }
  );
}

// A finished shift yesterday-ish for emp1 (and one for emp2 in between, to
// prove other employees never count as neighbours).
async function seed() {
  await clearFirestore();
  const base = Date.now() - 30 * HOUR;
  await db.doc(`companies/${C}`).set({ name: "Correct Co" });
  await db.doc(`users/admin-${C}`).set({ name: "Ada", companyId: C, role: "admin" });
  const ev = (id, employeeId, type, ms, extra = {}) =>
    db.doc(`companies/${C}/clockEvents/${id}`).set({
      employeeId, employeeName: employeeId, siteId: null, siteName: "", type, source: "pin",
      timestamp: admin.firestore.Timestamp.fromMillis(ms), ...extra,
    });
  await ev("in1", "emp1", "in", base);
  await ev("bs1", "emp1", "breakStart", base + 3 * HOUR);
  await ev("be1", "emp1", "breakEnd", base + 3.5 * HOUR);
  await ev("out1", "emp1", "out", base + 8 * HOUR);
  await ev("in2", "emp2", "in", base + 1 * HOUR);
  return base;
}

async function read(id) {
  return (await db.doc(`companies/${C}/clockEvents/${id}`).get()).data();
}

test("callable: the live website's payload still saves, with history", async () => {
  const base = await seed();
  await call({ eventId: "in1", newTimestamp: base - 15 * MIN, reason: "came early" });
  const d = await read("in1");
  assert.equal(d.adjustedTimestamp.toMillis(), base - 15 * MIN);
  assert.equal(d.timestamp.toMillis(), base, "raw timestamp never changes");
  assert.equal(d.adjustmentHistory.length, 1);
  assert.equal(d.adjustmentHistory[0].reason, "came early");
  assert.equal(d.adjustmentHistory[0].changedByName, "Ada");
});

test("callable: another employee's events are not neighbours", async () => {
  const base = await seed();
  // emp2 clocked in at base+1h; moving emp1's clock-in past it is fine.
  await call({ eventId: "in1", newTimestamp: base + 2 * HOUR });
  assert.equal((await read("in1")).adjustedTimestamp.toMillis(), base + 2 * HOUR);
});

test("callable: clock-in after its own clock-out / break is refused, nothing written", async () => {
  const base = await seed();
  await assert.rejects(call({ eventId: "in1", newTimestamp: base + 9 * HOUR }), (e) => {
    assert.equal(e.code, "failed-precondition");
    assert.match(e.message, /clock-in has to stay before the break start/);
    return true;
  });
  await assert.rejects(call({ eventId: "out1", newTimestamp: base + 1 * HOUR }), /clock-out has to stay after the break end/);
  assert.equal((await read("in1")).adjustedTimestamp, undefined);
  assert.equal((await read("out1")).adjustedTimestamp, undefined);
});

test("callable: an earlier correction is what counts as the neighbour's time", async () => {
  const base = await seed();
  await call({ eventId: "be1", newTimestamp: base + 6 * HOUR }); // break end moved later first
  await call({ eventId: "bs1", newTimestamp: base + 5 * HOUR }); // then break start
  await call({ eventId: "in1", newTimestamp: base + 4 * HOUR }); // now fine: still before 5h
  await assert.rejects(call({ eventId: "in1", newTimestamp: base + 5.5 * HOUR }), /break start/);
});

test("callable: future time, bad input, non-admin and other company are refused", async () => {
  const base = await seed();
  await assert.rejects(call({ eventId: "out1", newTimestamp: Date.now() + 10 * MIN }), /in the future/);
  await assert.rejects(call({ eventId: "out1", newTimestamp: "soon" }), (e) => e.code === "invalid-argument");
  await assert.rejects(call({ eventId: "out1", newTimestamp: base + 7 * HOUR, reason: "x".repeat(501) }), /under 500/);
  await assert.rejects(call({ eventId: "out1", newTimestamp: base + 7 * HOUR }, adminAuth(C, "supervisor")), (e) => e.code === "permission-denied");
  await assert.rejects(call({ eventId: "out1", newTimestamp: base + 7 * HOUR }, adminAuth("other-co")), (e) => e.code === "not-found");
  // 1 minute ahead is inside the 2-minute clock allowance; out1 is the
  // last event, so nothing comes after it.
  await call({ eventId: "out1", newTimestamp: Date.now() + 1 * MIN });
  assert.ok((await read("out1")).adjustedTimestamp);
});
