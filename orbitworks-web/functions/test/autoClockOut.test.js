// Auto Clock-Out sweep tests (functions/src/autoClockOut.ts). Same setup as
// alerts.test.js: the REAL compiled functions (lib/) against the Firestore
// emulator. TEST_COMPANY_IDS is set to ShipMate's id here, same as prod, to
// prove it no longer limits auto clock-out to ShipMate.
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
