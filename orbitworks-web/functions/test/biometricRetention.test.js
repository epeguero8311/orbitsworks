// Employee App Phase 3 Step 6 - the clock-photo retention sweeps in
// functions/src/biometricRetention.ts mark a deleted photo on its event
// (photoRemovedAt) and change NOTHING else. Runs the REAL compiled scheduled
// functions (lib/) via .run() against the Firestore emulator; Storage deletes
// go to an in-memory fake, so no test reaches Storage.
//
// Run: firebase emulators:exec --only firestore "node --test test/biometricRetention.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-retention-test";
// The sweeps read EVERY company, so this file needs its own emulator project.
// `firebase emulators:exec` sets FIREBASE_CONFIG, which firebase-admin
// prefers over GCLOUD_PROJECT - without this the sweep would see (and
// delete) photos other test files seed in parallel under `npm test`.
delete process.env.FIREBASE_CONFIG;
// Port must match firebase.json's emulators.firestore.port.
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

const deletedPaths = [];
admin.storage().bucket = () => ({
  file: (p) => ({
    delete: async () => {
      deletedPaths.push(p);
    },
  }),
});

const DAY = 24 * 60 * 60 * 1000;
const urlFor = (path) =>
  `https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=t`;
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);

async function clearAll() {
  await fetch(`http://localhost:8090/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
  deletedPaths.length = 0;
}

// A full clock event with everything the website shows.
function clockEvent(companyId, id, ageDays, extra = {}) {
  const path = `companies/${companyId}/clockEvents/emp1/${id}.jpg`;
  return {
    employeeId: "emp1",
    employeeName: "Ana",
    siteId: "site1",
    siteName: "Site One",
    type: "in",
    source: "employeeApp",
    timestamp: ts(Date.now() - ageDays * DAY),
    createdByUid: "uid1",
    photoUrl: urlFor(path),
    faceCheck: {
      status: "mismatch",
      similarity: 41.5,
      threshold: 90,
      referencePhotoUrl: urlFor(`companies/${companyId}/employees/emp1/reference.jpg`),
      facesInTarget: 1,
      checkedAt: ts(Date.now() - ageDays * DAY),
    },
    geofenceStatus: "inside",
    siteAutoDetected: false,
    ...extra,
  };
}

const eventRef = (c, id) => db.collection("companies").doc(c).collection("clockEvents").doc(id);

async function seedEmployee(c) {
  await db.collection("companies").doc(c).collection("employees").doc("emp1").set({
    name: "Ana",
    active: true,
    photoUrl: urlFor(`companies/${c}/employees/emp1/reference.jpg`),
  });
}

// Everything except photoUrl/photoRemovedAt must be byte-identical.
function withoutPhoto(data) {
  const copy = { ...data };
  delete copy.photoUrl;
  delete copy.photoRemovedAt;
  return copy;
}

test.beforeEach(clearAll);

test("cleanupClockEventPhotos: 90+ day photo deleted, marker set, everything else unchanged", async () => {
  const c = "br-old";
  await db.collection("companies").doc(c).set({ name: "Co", planTier: "pro_tier1" });
  await seedEmployee(c);
  const before = clockEvent(c, "e-old", 91);
  await eventRef(c, "e-old").set(before);
  // A resolved face alert on it (resolution older than 90 days) - alerts stay.
  await db.collection("companies").doc(c).collection("alerts").doc("a1").set({ eventId: "e-old", alertType: "faceMismatch", message: "x" });
  await db.collection("companies").doc(c).collection("alertActions").doc("aa1").set({ alertKey: "a1", resolvedAt: ts(Date.now() - 91 * DAY) });

  const startMs = Date.now();
  await funcs.cleanupClockEventPhotos.run({});

  const after = (await eventRef(c, "e-old").get()).data();
  assert.equal(after.photoUrl, undefined);
  assert.ok(after.photoRemovedAt, "photoRemovedAt set");
  assert.ok(after.photoRemovedAt.toMillis() >= startMs - 1000);
  assert.deepEqual(withoutPhoto(after), withoutPhoto(before));
  assert.deepEqual(after.faceCheck, before.faceCheck);
  assert.ok(deletedPaths.includes(`companies/${c}/clockEvents/emp1/e-old.jpg`));
  // Alert + its resolution untouched; reference selfie untouched.
  assert.equal((await db.doc(`companies/${c}/alerts/a1`).get()).data().alertType, "faceMismatch");
  assert.ok((await db.doc(`companies/${c}/alertActions/aa1`).get()).exists);
  const emp = (await db.doc(`companies/${c}/employees/emp1`).get()).data();
  assert.ok(emp.photoUrl.includes("reference.jpg"));
  assert.ok(!deletedPaths.some((p) => p.endsWith("reference.jpg")));
});

test("cleanupClockEventPhotos: recent photo and open face alert are left alone", async () => {
  const c = "br-keep";
  await db.collection("companies").doc(c).set({ name: "Co", planTier: "pro_tier1" });
  const recent = clockEvent(c, "e-recent", 30);
  const blocked = clockEvent(c, "e-blocked", 200);
  await eventRef(c, "e-recent").set(recent);
  await eventRef(c, "e-blocked").set(blocked);
  await db.collection("companies").doc(c).collection("alerts").doc("open").set({ eventId: "e-blocked", alertType: "faceMismatch" });

  await funcs.cleanupClockEventPhotos.run({});

  assert.deepEqual((await eventRef(c, "e-recent").get()).data(), recent);
  assert.deepEqual((await eventRef(c, "e-blocked").get()).data(), blocked);
  assert.equal(deletedPaths.length, 0);
});

test("cleanupClockEventPhotos: running again changes nothing (marker kept, no new delete)", async () => {
  const c = "br-again";
  await db.collection("companies").doc(c).set({ name: "Co", planTier: "core2_tier1" });
  await eventRef(c, "e1").set(clockEvent(c, "e1", 120));
  await funcs.cleanupClockEventPhotos.run({});
  const first = (await eventRef(c, "e1").get()).data();
  deletedPaths.length = 0;
  await funcs.cleanupClockEventPhotos.run({});
  const second = (await eventRef(c, "e1").get()).data();
  assert.deepEqual(second, first);
  assert.equal(deletedPaths.length, 0);
});

test("cleanupCanceledCompanyPhotos: clock photos get the same marker, events otherwise unchanged", async () => {
  const c = "br-canceled";
  await db.collection("companies").doc(c).set({
    name: "Co",
    planTier: "core2_tier1",
    planCanceledAt: ts(Date.now() - 95 * DAY),
    biometricPhotosWipedAt: null,
  });
  await seedEmployee(c);
  // Only 10 days old - the cancellation sweep ignores photo age.
  const before = clockEvent(c, "e-c", 10);
  await eventRef(c, "e-c").set(before);

  await funcs.cleanupCanceledCompanyPhotos.run({});

  const after = (await eventRef(c, "e-c").get()).data();
  assert.equal(after.photoUrl, undefined);
  assert.ok(after.photoRemovedAt);
  assert.deepEqual(withoutPhoto(after), withoutPhoto(before));
  assert.ok((await db.doc(`companies/${c}`).get()).data().biometricPhotosWipedAt);
});

test("cleanupCanceledCompanyPhotos: a company canceled under 90 days ago is untouched", async () => {
  const c = "br-canceled-recent";
  await db.collection("companies").doc(c).set({
    name: "Co",
    planTier: "core2_tier1",
    planCanceledAt: ts(Date.now() - 30 * DAY),
    biometricPhotosWipedAt: null,
  });
  const before = clockEvent(c, "e-c", 10);
  await eventRef(c, "e-c").set(before);
  await funcs.cleanupCanceledCompanyPhotos.run({});
  assert.deepEqual((await eventRef(c, "e-c").get()).data(), before);
});
