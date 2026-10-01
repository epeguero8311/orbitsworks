// Cloud Functions behavior tests for alert generation + push (Phase 4).
// Runs the REAL compiled functions (lib/) against the Firestore emulator
// (no mocking of Firestore itself) - only expo-server-sdk's network call
// is stubbed, so no test ever hits Expo's real push service. Triggers are
// invoked via their exported `.run(event)` (the raw handler), duck-typing
// the minimal event shape the handler actually reads (event.data.data(),
// event.params) rather than firebase-functions-test's mock-CloudEvent
// machinery, which expects plain serializable field maps it can encode to
// a Firestore proto - awkward for hand-built fixtures.
process.env.GCLOUD_PROJECT = "orbitworks-func-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Expo } = require("expo-server-sdk");
const admin = require("firebase-admin");

// Stub the real network call everywhere in this process - tests control
// what it returns per-case by reassigning this before each call.
let sendPushImpl = async (messages) => messages.map(() => ({ status: "ok" }));
Expo.prototype.sendPushNotificationsAsync = async (messages) => sendPushImpl(messages);

const funcs = require("../lib/index.js");
const alertsModule = require("../lib/alerts.js");
const pushSendModule = require("../lib/pushSend.js");
const { db } = require("../lib/shared.js");

async function clearFirestore() {
  await fetch(
    `http://localhost:8080/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: "DELETE" }
  );
}

function setFlags({ alertsFeed, pushEnabled, testCompanyIds }) {
  if (alertsFeed === undefined) delete process.env.ALERTS_FEED_ENABLED;
  else process.env.ALERTS_FEED_ENABLED = String(alertsFeed);
  if (pushEnabled === undefined) delete process.env.PUSH_NOTIFICATIONS_ENABLED;
  else process.env.PUSH_NOTIFICATIONS_ENABLED = String(pushEnabled);
  if (testCompanyIds === undefined) delete process.env.TEST_COMPANY_IDS;
  else process.env.TEST_COMPANY_IDS = testCompanyIds;
}

async function seedCompany(companyId, overrides = {}) {
  await db.collection("companies").doc(companyId).set({
    businessHours: { open: "08:00", close: "17:00" },
    attendanceRules: { gracePeriodMinutes: 0, autoClockOut: false },
    weeklyOvertimeThreshold: 40,
    alerts: {
      maxHoursWarning: true,
      maxHoursThreshold: 8,
      overtimeWarning: true,
      missedClockOutAlert: true,
      missedClockOutMinutes: 30,
      maxBreakWarning: true,
      maxBreakMinutes: 15,
      lateClockInAlert: true,
      earlyClockOutAlert: true,
    },
    ...overrides,
  });
}

async function seedEmployee(companyId, employeeId) {
  await db.collection("companies").doc(companyId).collection("employees").doc(employeeId).set({
    name: "Test Employee",
    active: true,
  });
}

// A real admin.firestore.Timestamp, not a duck-typed fake - it gets
// written into Firestore as occurredAt, so it must be encodable.
function lateClockInEvent({ employeeId, minutesLate, dateStr = "2026-06-15" }) {
  const hh = String(8 + Math.floor(minutesLate / 60)).padStart(2, "0");
  const mm = String(minutesLate % 60).padStart(2, "0");
  const ts = new Date(`${dateStr}T${hh}:${mm}:00-05:00`);
  return {
    employeeId,
    employeeName: "Jordan",
    siteId: null,
    siteName: null,
    type: "in",
    timestamp: admin.firestore.Timestamp.fromDate(ts),
  };
}

// seedCompany's default businessHours.close is 17:00 - minutesEarly is how
// far before that the clock-out lands.
function earlyClockOutEvent({ employeeId, minutesEarly, dateStr = "2026-06-15" }) {
  const totalMinutes = 17 * 60 - minutesEarly;
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  const ts = new Date(`${dateStr}T${hh}:${mm}:00-05:00`);
  return {
    employeeId,
    employeeName: "Jordan",
    siteId: null,
    siteName: null,
    type: "out",
    timestamp: admin.firestore.Timestamp.fromDate(ts),
  };
}

async function countAlerts(companyId) {
  const snap = await db.collection("companies").doc(companyId).collection("alerts").get();
  return snap.size;
}

function fakeClockEventDoc(data) {
  return { data: () => data };
}

test.beforeEach(async () => {
  await clearFirestore();
  setFlags({});
  sendPushImpl = async (messages) => messages.map(() => ({ status: "ok" }));
});

test("kill switch OFF: no alert doc, no push", async () => {
  const companyId = "c1";
  await seedCompany(companyId);
  setFlags({ alertsFeed: false, pushEnabled: true });

  await alertsModule.checkLateClockIn(companyId, "evt1", lateClockInEvent({ employeeId: "e1", minutesLate: 20 }));

  assert.equal(await countAlerts(companyId), 0);
});

test("TEST_COMPANY_IDS set: only the allowlisted company gets alerts", async () => {
  const allowedCompanyId = "c1-allowed";
  const otherCompanyId = "c1-other";
  await seedCompany(allowedCompanyId);
  await seedCompany(otherCompanyId);
  setFlags({ alertsFeed: true, pushEnabled: false, testCompanyIds: `${allowedCompanyId}, some-other-id` });

  await alertsModule.checkLateClockIn(
    allowedCompanyId,
    "evt1",
    lateClockInEvent({ employeeId: "e1", minutesLate: 20 })
  );
  await alertsModule.checkLateClockIn(
    otherCompanyId,
    "evt2",
    lateClockInEvent({ employeeId: "e1", minutesLate: 20 })
  );

  assert.equal(await countAlerts(allowedCompanyId), 1);
  assert.equal(await countAlerts(otherCompanyId), 0);
});

test("TEST_COMPANY_IDS empty/unset: no restriction (today's behavior)", async () => {
  const companyId = "c1-unrestricted";
  await seedCompany(companyId);
  setFlags({ alertsFeed: true, pushEnabled: false });

  await alertsModule.checkLateClockIn(companyId, "evt1", lateClockInEvent({ employeeId: "e1", minutesLate: 20 }));

  assert.equal(await countAlerts(companyId), 1);
});

test("alert toggle off on web: no alert for that type", async () => {
  const companyId = "c2";
  await seedCompany(companyId, {
    alerts: {
      lateClockInAlert: false,
      maxHoursWarning: true,
      maxHoursThreshold: 8,
      overtimeWarning: true,
      missedClockOutAlert: true,
      missedClockOutMinutes: 30,
      maxBreakWarning: true,
      maxBreakMinutes: 15,
      earlyClockOutAlert: true,
    },
  });
  setFlags({ alertsFeed: true, pushEnabled: false });

  await alertsModule.checkLateClockIn(companyId, "evt1", lateClockInEvent({ employeeId: "e1", minutesLate: 20 }));

  assert.equal(await countAlerts(companyId), 0);
});

test("lateClockIn fires once with the right reason", async () => {
  const companyId = "c3";
  await seedCompany(companyId);
  setFlags({ alertsFeed: true, pushEnabled: false });

  await alertsModule.checkLateClockIn(companyId, "evt1", lateClockInEvent({ employeeId: "e1", minutesLate: 20 }));

  const snap = await db.collection("companies").doc(companyId).collection("alerts").get();
  assert.equal(snap.size, 1);
  const alert = snap.docs[0].data();
  assert.equal(alert.alertType, "lateClockIn");
  assert.equal(alert.message, "Clocked in late");
});

test("earlyClockOut fires once with the right reason", async () => {
  const companyId = "c3-early";
  await seedCompany(companyId);
  setFlags({ alertsFeed: true, pushEnabled: false });

  await alertsModule.checkEarlyClockOut(companyId, "evt1", earlyClockOutEvent({ employeeId: "e1", minutesEarly: 20 }));

  const snap = await db.collection("companies").doc(companyId).collection("alerts").get();
  assert.equal(snap.size, 1);
  const alert = snap.docs[0].data();
  assert.equal(alert.alertType, "earlyClockOut");
  assert.equal(alert.message, "Clocked out early");
});

test("earlyClockOut does not fire for a clock-out at/after close", async () => {
  const companyId = "c3-not-early";
  await seedCompany(companyId);
  setFlags({ alertsFeed: true, pushEnabled: false });

  await alertsModule.checkEarlyClockOut(companyId, "evt1", earlyClockOutEvent({ employeeId: "e1", minutesEarly: 0 }));

  assert.equal(await countAlerts(companyId), 0);
});

test("retried/replayed event produces exactly one alert and one push", async () => {
  const companyId = "c4";
  await seedCompany(companyId);
  setFlags({ alertsFeed: true, pushEnabled: true });
  await db.collection("companies").doc(companyId).collection("pushTokens").doc("dev1").set({
    deviceId: "dev1",
    token: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    platform: "ios",
    notificationsEnabled: true,
  });

  let pushCallCount = 0;
  sendPushImpl = async (messages) => {
    pushCallCount++;
    return messages.map(() => ({ status: "ok" }));
  };

  const evt = lateClockInEvent({ employeeId: "e1", minutesLate: 20 });
  await alertsModule.checkLateClockIn(companyId, "evt1", evt);
  await alertsModule.checkLateClockIn(companyId, "evt1", evt); // replay

  assert.equal(await countAlerts(companyId), 1);
  assert.equal(pushCallCount, 1);
});

test("push send forced to throw: alert doc still written, no exception escapes", async () => {
  const companyId = "c5";
  await seedCompany(companyId);
  await seedEmployee(companyId, "e1");
  setFlags({ alertsFeed: true, pushEnabled: true });
  sendPushImpl = async () => {
    throw new Error("simulated Expo outage");
  };

  const fakeEvent = {
    data: fakeClockEventDoc(lateClockInEvent({ employeeId: "e1", minutesLate: 20 })),
    params: { companyId, eventId: "evt-push-fail" },
  };

  await assert.doesNotReject(funcs.onClockEventCreated.run(fakeEvent));
  assert.equal(await countAlerts(companyId), 1);
});

test("alert generation forced to throw: clock event still completes (lastEventType still updated)", async () => {
  const companyId = "c6";
  await seedCompany(companyId);
  await seedEmployee(companyId, "e1");
  setFlags({ alertsFeed: true, pushEnabled: false });

  const original = alertsModule.checkLateClockIn;
  alertsModule.checkLateClockIn = async () => {
    throw new Error("simulated alert generation crash");
  };
  try {
    const fakeEvent = {
      data: fakeClockEventDoc(lateClockInEvent({ employeeId: "e1", minutesLate: 20 })),
      params: { companyId, eventId: "evt-alert-fail" },
    };
    await assert.doesNotReject(funcs.onClockEventCreated.run(fakeEvent));

    const empSnap = await db.collection("companies").doc(companyId).collection("employees").doc("e1").get();
    assert.equal(empSnap.data().lastEventType, "in");
  } finally {
    alertsModule.checkLateClockIn = original;
  }
});

test("missing/garbage input: skipped silently, no throw, no alert", async () => {
  await assert.doesNotReject(alertsModule.checkLateClockIn("", "evt1", lateClockInEvent({ employeeId: "e1", minutesLate: 20 })));
  await assert.doesNotReject(alertsModule.checkLateClockIn("nonexistent-company", "evt1", lateClockInEvent({ employeeId: "e1", minutesLate: 20 })));
  await assert.doesNotReject(
    alertsModule.checkLateClockIn("c7", "evt1", { type: "in", employeeId: "", timestamp: admin.firestore.Timestamp.now() })
  );
  assert.equal(await countAlerts("c7"), 0);
});

test("stale push token (DeviceNotRegistered) is removed", async () => {
  const companyId = "c8";
  await db.collection("companies").doc(companyId).collection("pushTokens").doc("stale-dev").set({
    deviceId: "stale-dev",
    token: "ExponentPushToken[staleeeeeeeeeeeeeeeeee]",
    platform: "ios",
    notificationsEnabled: true,
  });
  setFlags({ pushEnabled: true });
  sendPushImpl = async (messages) =>
    messages.map(() => ({ status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }));

  await pushSendModule.sendPushForAlert({
    id: "alert1",
    companyId,
    alertType: "lateClockIn",
    message: "test",
  });

  const tokenSnap = await db.collection("companies").doc(companyId).collection("pushTokens").doc("stale-dev").get();
  assert.equal(tokenSnap.exists, false);
});

test("breakTooLong fires via the periodic sweep", async () => {
  const companyId = "c9";
  await seedCompany(companyId);
  setFlags({ alertsFeed: true, pushEnabled: false });

  const now = Date.now();
  await db.collection("companies").doc(companyId).collection("clockEvents").add({
    employeeId: "e1",
    employeeName: "Sam",
    siteId: null,
    siteName: null,
    type: "in",
    timestamp: admin.firestore.Timestamp.fromDate(new Date(now - 3 * 60 * 60 * 1000)),
  });
  await db.collection("companies").doc(companyId).collection("clockEvents").add({
    employeeId: "e1",
    employeeName: "Sam",
    siteId: null,
    siteName: null,
    type: "breakStart",
    timestamp: admin.firestore.Timestamp.fromDate(new Date(now - 20 * 60 * 1000)), // 20 min ago, over the 15m default limit
  });

  await funcs.checkPeriodicAlerts.run({});

  const snap = await db
    .collection("companies")
    .doc(companyId)
    .collection("alerts")
    .where("alertType", "==", "breakTooLong")
    .get();
  assert.equal(snap.size, 1);
});

test("TEST_COMPANY_IDS restricts the periodic sweep too", async () => {
  const companyId = "c9-not-allowed";
  await seedCompany(companyId);
  setFlags({ alertsFeed: true, pushEnabled: false, testCompanyIds: "some-other-company" });

  const now = Date.now();
  await db.collection("companies").doc(companyId).collection("clockEvents").add({
    employeeId: "e1",
    employeeName: "Sam",
    siteId: null,
    siteName: null,
    type: "in",
    timestamp: admin.firestore.Timestamp.fromDate(new Date(now - 3 * 60 * 60 * 1000)),
  });
  await db.collection("companies").doc(companyId).collection("clockEvents").add({
    employeeId: "e1",
    employeeName: "Sam",
    siteId: null,
    siteName: null,
    type: "breakStart",
    timestamp: admin.firestore.Timestamp.fromDate(new Date(now - 20 * 60 * 1000)),
  });

  await funcs.checkPeriodicAlerts.run({});

  assert.equal(await countAlerts(companyId), 0);
});

test("maxHours fires via the periodic sweep", async () => {
  const companyId = "c10";
  await seedCompany(companyId); // defaults include maxHoursThreshold: 8
  setFlags({ alertsFeed: true, pushEnabled: false });

  const now = Date.now();
  await db.collection("companies").doc(companyId).collection("clockEvents").add({
    employeeId: "e1",
    employeeName: "Sam",
    siteId: null,
    siteName: null,
    type: "in",
    timestamp: admin.firestore.Timestamp.fromDate(new Date(now - 9 * 60 * 60 * 1000)), // 9h ago, over the 8h default
  });

  await funcs.checkPeriodicAlerts.run({});

  const snap = await db.collection("companies").doc(companyId).collection("alerts").where("alertType", "==", "maxHours").get();
  assert.equal(snap.size, 1);
});

test("missedClockOut fires via the periodic sweep (autoClockOut off)", async () => {
  const companyId = "c11";
  await seedCompany(companyId);
  setFlags({ alertsFeed: true, pushEnabled: false });

  await db.collection("companies").doc(companyId).collection("clockEvents").add({
    employeeId: "e1",
    employeeName: "Sam",
    siteId: null,
    siteName: null,
    type: "in",
    timestamp: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 60 * 1000)), // 30h ago - prior day, still "in"
  });

  await funcs.checkPeriodicAlerts.run({});

  const snap = await db
    .collection("companies")
    .doc(companyId)
    .collection("alerts")
    .where("alertType", "==", "missedClockOut")
    .get();
  assert.equal(snap.size, 1);
});


test("overtime fires via the periodic sweep", async () => {
  const companyId = "c13";
  await seedCompany(companyId, {
    weeklyOvertimeThreshold: 1, // low bar so a short seeded shift trips it
  });
  setFlags({ alertsFeed: true, pushEnabled: false });

  const now = Date.now();
  await db.collection("companies").doc(companyId).collection("clockEvents").add({
    employeeId: "e1",
    employeeName: "Sam",
    siteId: null,
    siteName: null,
    type: "in",
    timestamp: admin.firestore.Timestamp.fromDate(new Date(now - 3 * 60 * 60 * 1000)),
  });

  await funcs.checkPeriodicAlerts.run({});

  const snap = await db.collection("companies").doc(companyId).collection("alerts").where("alertType", "==", "overtime").get();
  assert.equal(snap.size, 1);
});
