// Auto Clock-Out sweep tests (functions/src/autoClockOut.ts). Same setup as
// alerts.test.js: the REAL compiled functions (lib/) against the Firestore
// emulator. A leftover TEST_COMPANY_IDS (ShipMate's id, as prod's .env had it)
// is set here to prove it never limited auto clock-out to ShipMate.
process.env.GCLOUD_PROJECT = "orbitworks-func-test";
// Port must match firebase.json's emulators.firestore.port.
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Expo } = require("expo-server-sdk");
const admin = require("firebase-admin");

// No test here should push, but stub the network call anyway.
Expo.prototype.sendPushNotificationsAsync = async (messages) => messages.map(() => ({ status: "ok" }));

const funcs = require("../lib/index.js");
const { db } = require("../lib/shared.js");

const SHIPMATE_ID = "qdLsh075T743sGEKyZs7";
const HOUR = 60 * 60 * 1000;

async function clearFirestore() {
  await fetch(
    `http://localhost:8090/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: "DELETE" }
  );
}

function setProdLikeFlags() {
  process.env.AUTO_CLOCK_OUT_ENABLED = "true";
  process.env.ALERTS_FEED_ENABLED = "false";
  process.env.PUSH_NOTIFICATIONS_ENABLED = "false";
  process.env.TEST_COMPANY_IDS = SHIPMATE_ID;
}

async function seedCompany(companyId, autoClockOut) {
  await db.collection("companies").doc(companyId).set({
    businessHours: { open: "08:00", close: "17:00" },
    ...(autoClockOut ? { autoClockOut } : {}),
  });
  await db.collection("companies").doc(companyId).collection("employees").doc("e1").set({
    name: "Test Employee",
    active: true,
  });
}

// A clock-in `hoursAgo` hours ago, still open (no "out").
async function seedOpenShift(companyId, eventId, hoursAgo) {
  const data = {
    employeeId: "e1",
    employeeName: "Jordan",
    siteId: null,
    siteName: "",
    subcontractorId: null,
    subcontractorName: null,
    type: "in",
    source: "pin",
    timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - hoursAgo * HOUR),
  };
  await db.collection("companies").doc(companyId).collection("clockEvents").doc(eventId).set(data);
  return data;
}

async function getAutoOut(companyId, clockInId) {
  return db.collection("companies").doc(companyId).collection("clockEvents").doc(`auto-${clockInId}`).get();
}

async function countOutEvents(companyId) {
  const snap = await db.collection("companies").doc(companyId).collection("clockEvents").where("type", "==", "out").get();
  return snap.size;
}

async function autoOutAlerts(companyId) {
  const snap = await db.collection("companies").doc(companyId).collection("alerts").where("alertType", "==", "autoClockOut").get();
  return snap.docs;
}

test.beforeEach(async () => {
  await clearFirestore();
  setProdLikeFlags();
});

test("company with auto clock-out ON (not in TEST_COMPANY_IDS) gets clocked out at the cap", async () => {
  const companyId = "real-co-on";
  await seedCompany(companyId, { enabled: true, maxWorkedHours: 12 });
  const clockIn = await seedOpenShift(companyId, "in1", 13);

  await funcs.runAutoClockOut.run({});

  const out = await getAutoOut(companyId, "in1");
  assert.equal(out.exists, true);
  assert.equal(out.data().type, "out");
  assert.equal(out.data().source, "autoClockOut");
  assert.equal(out.data().autoClockOutCapHours, 12);
  assert.equal(out.data().timestamp.toMillis(), clockIn.timestamp.toMillis() + 12 * HOUR);
  assert.equal((await autoOutAlerts(companyId)).length, 1);
});

test("company with auto clock-out OFF is not clocked out", async () => {
  const off = "real-co-off";
  const missing = "real-co-no-setting";
  await seedCompany(off, { enabled: false, maxWorkedHours: 12 });
  await seedCompany(missing, null);
  await seedOpenShift(off, "in1", 13);
  await seedOpenShift(missing, "in1", 30);

  await funcs.runAutoClockOut.run({});

  assert.equal((await getAutoOut(off, "in1")).exists, false);
  assert.equal((await getAutoOut(missing, "in1")).exists, false);
  assert.equal(await countOutEvents(off), 0);
  assert.equal(await countOutEvents(missing), 0);
});

test("ShipMate (the TEST_COMPANY_IDS company) still gets clocked out", async () => {
  await seedCompany(SHIPMATE_ID, { enabled: true, maxWorkedHours: 12 });
  await seedOpenShift(SHIPMATE_ID, "in1", 13);

  await funcs.runAutoClockOut.run({});

  assert.equal((await getAutoOut(SHIPMATE_ID, "in1")).exists, true);
});

test("shift under the cap is left alone", async () => {
  const companyId = "real-co-under";
  await seedCompany(companyId, { enabled: true, maxWorkedHours: 12 });
  await seedOpenShift(companyId, "in1", 5);

  await funcs.runAutoClockOut.run({});

  assert.equal((await getAutoOut(companyId, "in1")).exists, false);
});

test("running the sweep twice writes only one auto clock-out", async () => {
  const companyId = "real-co-twice";
  await seedCompany(companyId, { enabled: true, maxWorkedHours: 12 });
  await seedOpenShift(companyId, "in1", 13);

  await funcs.runAutoClockOut.run({});
  await funcs.runAutoClockOut.run({});

  assert.equal(await countOutEvents(companyId), 1);
  assert.equal((await autoOutAlerts(companyId)).length, 1);
});

test("a phone/offline punch wins: real out removes the auto clock-out and its alert", async () => {
  const companyId = "real-co-punch";
  await seedCompany(companyId, { enabled: true, maxWorkedHours: 12 });
  const clockIn = await seedOpenShift(companyId, "in1", 13);

  await funcs.runAutoClockOut.run({});
  assert.equal((await getAutoOut(companyId, "in1")).exists, true);
  assert.equal((await autoOutAlerts(companyId)).length, 1);

  // The employee's real "out" (punched 10h in, synced late) arrives.
  const realOut = {
    employeeId: "e1",
    employeeName: "Jordan",
    siteId: null,
    siteName: "",
    type: "out",
    source: "pin",
    timestamp: admin.firestore.Timestamp.fromMillis(clockIn.timestamp.toMillis() + 10 * HOUR),
  };
  await db.collection("companies").doc(companyId).collection("clockEvents").doc("out1").set(realOut);
  await funcs.onClockEventCreated.run({
    data: { data: () => realOut },
    params: { companyId, eventId: "out1" },
  });

  assert.equal((await getAutoOut(companyId, "in1")).exists, false);
  assert.equal((await autoOutAlerts(companyId)).length, 0);

  // And the next sweep does not re-add it (shift is closed by the real out).
  await funcs.runAutoClockOut.run({});
  assert.equal((await getAutoOut(companyId, "in1")).exists, false);
});

// Fix round 2 (G a): an auto clock-out has no location - it keeps the
// clock-in's site (clock-outs from the phones are detected on their own).
test("auto clock-out keeps the clock-in's site", async () => {
  const companyId = "real-co-site";
  await seedCompany(companyId, { enabled: true, maxWorkedHours: 12 });
  await seedOpenShift(companyId, "in1", 13);
  await db.collection("companies").doc(companyId).collection("clockEvents").doc("in1").update({ siteId: "siteA", siteName: "Site A" });
  await funcs.runAutoClockOut.run({});
  const out = await getAutoOut(companyId, "in1");
  assert.equal(out.data().siteId, "siteA");
  assert.equal(out.data().siteName, "Site A");
});

// ---- Overtime (Task 1) step 7: combined day with the Overtime toggle ON ----

async function seedClosedShift(companyId, id, startHoursAgo, endHoursAgo) {
  const base = { employeeId: "e1", employeeName: "Jordan", siteId: null, siteName: "", subcontractorId: null, subcontractorName: null, source: "pin" };
  const col = db.collection("companies").doc(companyId).collection("clockEvents");
  await col.doc(id).set({ ...base, type: "in", timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - startHoursAgo * HOUR) });
  await col.doc(`${id}-out`).set({ ...base, type: "out", timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - endHoursAgo * HOUR) });
}

// Fixed "now" mid-afternoon Chicago so every shift below is on one day.
const NOON_PLUS = Date.parse("2026-10-21T21:00:00-05:00");

test("Overtime ON: cap counts the day's earlier closed shift; only the open shift is closed", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOON_PLUS });
  const companyId = "ot-on-combined";
  await seedCompany(companyId, { enabled: true, maxWorkedHours: 12 });
  await db.collection("companies").doc(companyId).set({ overtimeEnabled: true }, { merge: true });
  await seedClosedShift(companyId, "early", 13, 8); // 8am-1pm = 5h
  const clockIn = await seedOpenShift(companyId, "late", 7.5); // since 1:30pm = 7.5h
  await funcs.runAutoClockOut.run({});
  const out = await getAutoOut(companyId, "late");
  assert.ok(out.exists);
  // 12h cap - 5h earlier = 7h into the open shift.
  assert.equal(out.data().timestamp.toMillis(), clockIn.timestamp.toMillis() + 7 * HOUR);
  const early = await db.collection("companies").doc(companyId).collection("clockEvents").doc("early-out").get();
  assert.equal(early.data().timestamp.toMillis(), NOON_PLUS - 8 * HOUR); // untouched
  assert.equal((await getAutoOut(companyId, "early")).exists, false);
});

test("Overtime ON: earlier shifts' Automatic Break is subtracted (decision 5)", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOON_PLUS });
  const companyId = "ot-on-autobreak";
  await seedCompany(companyId, { enabled: true, maxWorkedHours: 12 });
  await db.collection("companies").doc(companyId).set(
    { overtimeEnabled: true, exportSettings: { automaticBreakMinutes: 30, minimumShiftHours: 6 } },
    { merge: true }
  );
  await seedClosedShift(companyId, "early", 13, 6); // 8am-3pm = 7h gross -> 6.5h worked
  const clockIn = await seedOpenShift(companyId, "late", 5.75); // since 3:15pm = 5.75h
  await funcs.runAutoClockOut.run({});
  const out = await getAutoOut(companyId, "late");
  assert.ok(out.exists); // 6.5 + 5.75 = 12.25 > 12
  assert.equal(out.data().timestamp.toMillis(), clockIn.timestamp.toMillis() + 5.5 * HOUR);
});

test("Overtime OFF: earlier closed shifts don't count (per shift, as today)", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOON_PLUS });
  const companyId = "ot-off-pershift";
  await seedCompany(companyId, { enabled: true, maxWorkedHours: 12 });
  await seedClosedShift(companyId, "early", 13, 8);
  await seedOpenShift(companyId, "late", 7.5);
  await funcs.runAutoClockOut.run({});
  assert.equal((await getAutoOut(companyId, "late")).exists, false);
});

test("Overtime ON: a closed shift on another day doesn't count", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOON_PLUS });
  const companyId = "ot-on-otherday";
  await seedCompany(companyId, { enabled: true, maxWorkedHours: 12 });
  await db.collection("companies").doc(companyId).set({ overtimeEnabled: true }, { merge: true });
  await seedClosedShift(companyId, "yesterday", 30, 25); // previous day
  await seedOpenShift(companyId, "late", 7.5);
  await funcs.runAutoClockOut.run({});
  assert.equal((await getAutoOut(companyId, "late")).exists, false);
});
