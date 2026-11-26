// Task 6 (update banner, U1-U3) - reportAppVersion, the app version on
// kiosk punches, and onClockEventCreated copying it onto the device doc.
// Real compiled functions (lib/) against the Firestore + Auth emulators.
// Run: firebase emulators:exec --only firestore,auth "node --test test/appVersions.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-appversions-test";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "localhost:8090";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "true";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";
process.env.KIOSK_ENABLED = "true";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const admin = require("firebase-admin");
const { RekognitionClient } = require("@aws-sdk/client-rekognition");
RekognitionClient.prototype.send = async () => ({ FaceMatches: [{ Similarity: 98 }], UnmatchedFaces: [] });

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

const files = new Map();
admin.storage().bucket = () => ({
  name: "test-bucket",
  file: (p) => ({
    getMetadata: async () => {
      if (!files.has(p)) throw Object.assign(new Error("nf"), { code: 404 });
      return [files.get(p)];
    },
    setMetadata: async () => [files.get(p)],
    delete: async () => files.delete(p),
    download: async () => [Buffer.from("x")],
  }),
});
const addPhoto = (p) =>
  files.set(p, { contentType: "image/jpeg", size: "2000", timeCreated: new Date().toISOString(), metadata: { firebaseStorageDownloadTokens: "t" } });

const run = (fn, data, auth) => funcs[fn].run({ data, auth, rawRequest: {} });
const auth = (c, role, extra = {}) => ({ uid: `${role}-${c}`, token: { role, companyId: c, ...extra } });
const KIOSK_UID = (c) => `kiosk-uid-${c}`;

async function seed(c) {
  const co = db.collection("companies").doc(c);
  await co.set({ name: "Co " + c, planTier: "pro_tier1", employeeCap: 50, activeEmployeeCount: 2 });
  await co.collection("employees").doc("emp1").set({ name: "Ana", active: true, assignedSiteIds: [] });
  await co.collection("employeePins").doc("emp1").set({ pin: "1234" });
  await co.collection("employees").doc("kiosk1").set({ name: "Front iPad", active: true, kiosk: true, linkedUserId: KIOSK_UID(c) });
  await db.doc(`users/${KIOSK_UID(c)}`).set({ role: "kiosk", companyId: c, name: "Front iPad" });
  const named = randomUUID();
  await co.collection("devices").doc(named).set({ name: "Gate iPad", platform: "ios", locked: false });
  return { co, named };
}

test("reportAppVersion: stamps a named device for supervisor / admin / owner / kiosk logins", async () => {
  const { co, named } = await seed("r1");
  for (const role of ["supervisor", "admin", "owner"]) {
    const r = await run("reportAppVersion", { deviceId: named, version: "1.1.6", platform: "ios" }, auth("r1", role));
    assert.equal(r.recorded, true, role);
  }
  const r = await run("reportAppVersion", { deviceId: named, version: "1.1.7", platform: "ios" }, { uid: KIOSK_UID("r1"), token: { role: "kiosk", companyId: "r1", employeeId: "kiosk1" } });
  assert.equal(r.recorded, true);
  const d = (await co.collection("devices").doc(named).get()).data();
  assert.equal(d.appVersion, "1.1.7");
  assert.equal(d.appPlatform, "ios");
  assert.ok(d.appVersionAt);
});

test("reportAppVersion: employees' phones never recorded; unnamed device never created; bad input refused", async () => {
  const { co, named } = await seed("r2");
  const r = await run("reportAppVersion", { deviceId: named, version: "1.1.6", platform: "ios" }, auth("r2", "employee", { employeeId: "emp1" }));
  assert.equal(r.recorded, false);
  assert.equal((await co.collection("devices").doc(named).get()).get("appVersion"), undefined);

  const unnamed = randomUUID();
  const u = await run("reportAppVersion", { deviceId: unnamed, version: "1.1.6", platform: "ios" }, auth("r2", "supervisor"));
  assert.equal(u.recorded, false);
  assert.equal((await co.collection("devices").doc(unnamed).get()).exists, false);

  for (const bad of [{ deviceId: named, version: "1.1.6-beta", platform: "ios" }, { deviceId: named, version: "1.1.6", platform: "web" }, { deviceId: "x", version: "1.1.6", platform: "ios" }, { deviceId: named, version: "1.1.6", platform: "ios", extra: 1 }]) {
    await assert.rejects(run("reportAppVersion", bad, auth("r2", "supervisor")), (e) => e.code === "invalid-argument");
  }
  await assert.rejects(run("reportAppVersion", { deviceId: named, version: "1.1.6", platform: "ios" }, undefined), (e) => e.code === "unauthenticated");
});

test("kioskPunch carries appVersion/appPlatform onto the event; a bad version is dropped, never refused", async () => {
  const { co } = await seed("k1");
  const deviceId = randomUUID();
  const punch = async (extra) => {
    const requestId = randomUUID();
    const photoPath = `companies/k1/clockEvents/emp1/${requestId}.jpg`;
    addPhoto(photoPath);
    return run(
      "kioskPunch",
      { action: extra.action, requestId, employeeId: "emp1", pin: "1234", photoPath, deviceId, ...extra.fields },
      { uid: KIOSK_UID("k1"), token: { role: "kiosk", companyId: "k1", employeeId: "kiosk1" } }
    );
  };
  const r = await punch({ action: "in", fields: { appVersion: "1.1.6", appPlatform: "ios" } });
  const ev = (await co.collection("clockEvents").doc(r.eventId).get()).data();
  assert.equal(ev.appVersion, "1.1.6");
  assert.equal(ev.appPlatform, "ios");
  const r2 = await punch({ action: "out", fields: { appVersion: "not a version", appPlatform: "pc" } });
  const ev2 = (await co.collection("clockEvents").doc(r2.eventId).get()).data();
  assert.equal(ev2.appVersion, undefined);
  assert.equal(ev2.appPlatform, undefined);
});

test("onClockEventCreated copies a newer punch's app version onto the named device", async () => {
  const { co, named } = await seed("t1");
  const fire = async (id, data) => {
    await co.collection("clockEvents").doc(id).set(data);
    await funcs.onClockEventCreated.run({ data: { data: () => data, ref: co.collection("clockEvents").doc(id) }, params: { companyId: "t1", eventId: id } }).catch(() => {});
  };
  const base = { employeeId: "emp1", employeeName: "Ana", type: "in", source: "pin", deviceId: named, createdByUid: "sup", siteId: null, siteName: "Not specified" };
  await fire("e1", { ...base, timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 60000), appVersion: "1.1.6", appPlatform: "ios" });
  let d = (await co.collection("devices").doc(named).get()).data();
  assert.equal(d.appVersion, "1.1.6");
  assert.equal(d.appPlatform, "ios");
  // an older build's punch (no version) keeps what's there
  await fire("e2", { ...base, type: "out", timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 30000) });
  d = (await co.collection("devices").doc(named).get()).data();
  assert.equal(d.appVersion, "1.1.6");
  // employee-app punches never touch devices
  await fire("e3", { ...base, source: "employeeApp", timestamp: admin.firestore.Timestamp.now(), appVersion: "9.9.9" });
  d = (await co.collection("devices").doc(named).get()).data();
  assert.equal(d.appVersion, "1.1.6");
});
