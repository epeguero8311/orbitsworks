// Employee App Phase 3 Step 3 - onClockEventCreated with source "employeeApp"
// next to the existing sources. Runs the REAL compiled trigger (lib/) against
// the Firestore emulator, invoked via its exported .run(event) like
// alerts.test.js does. AWS Rekognition and Storage downloads are stubbed the
// same way rekognition.test.js stubs them, so no test reaches AWS or Storage.
//
// Run: firebase emulators:exec --only firestore "node --test test/clockEventSources.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-clocksources-test";
// Port must match firebase.json's emulators.firestore.port.
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";
// Dummy secrets - the AWS client is stubbed below. An empty Mapbox token makes
// reverseGeocode return early, so nothing reaches the network.
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
// Alerts and device tracking off - these tests are about the face check and
// site handling, not alert or device docs.
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { RekognitionClient } = require("@aws-sdk/client-rekognition");

let sendCallCount = 0;
RekognitionClient.prototype.send = async function () {
  sendCallCount++;
  return { FaceMatches: [{ Similarity: 97.2 }], UnmatchedFaces: [] };
};

// Loads shared.ts first, which runs admin.initializeApp().
const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

admin.storage().bucket = () => ({
  file: () => ({
    download: async () => [Buffer.from("fake-image-bytes")],
  }),
});

const REFERENCE_PHOTO_URL =
  "https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/companies%2Ftest%2Femployees%2Femp1%2Freference.jpg?alt=media&token=ref-token";
const CLOCK_PHOTO_URL =
  "https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/companies%2Ftest%2FclockEvents%2Femp1%2F123.jpg?alt=media&token=clock-token";

const PRO = "pro_tier1";
const CORE = "core2_tier1";

async function seedCompany(companyId, planTier) {
  await db.collection("companies").doc(companyId).set({ planTier });
}

async function seedEmployee(companyId, { withSelfie }) {
  await db
    .collection("companies")
    .doc(companyId)
    .collection("employees")
    .doc("emp1")
    .set({ name: "Jordan", active: true, ...(withSelfie ? { photoUrl: REFERENCE_PHOTO_URL } : {}) });
}

// Writes the event doc (checkFaceMatch re-reads it), then runs the trigger
// with the duck-typed onCreate event shape the handler reads.
async function createAndTrigger(companyId, eventId, fields) {
  const ref = db.collection("companies").doc(companyId).collection("clockEvents").doc(eventId);
  const data = {
    employeeId: "emp1",
    employeeName: "Jordan",
    siteId: null,
    siteName: "",
    type: "in",
    timestamp: admin.firestore.Timestamp.fromDate(new Date("2026-10-21T14:00:00Z")),
    ...fields,
  };
  await ref.set(data);
  sendCallCount = 0;
  await funcs.onClockEventCreated.run({ params: { companyId, eventId }, data: { data: () => data, ref } });
  const after = (await ref.get()).data();
  return { event: after, awsCalls: sendCallCount };
}

async function getDoc(path) {
  return (await db.doc(path).get()).data();
}

// ---- employeeApp ----

test("employeeApp, Pro + clock photo + selfie: face check runs", async () => {
  const c = "src-ea-pro";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: true });
  const { event, awsCalls } = await createAndTrigger(c, "e1", { source: "employeeApp", photoUrl: CLOCK_PHOTO_URL });
  assert.equal(awsCalls, 1);
  assert.equal(event.faceCheck.status, "match");
  assert.equal(event.faceCheck.similarity, 97.2);
  assert.equal(event.faceCheck.referencePhotoUrl, REFERENCE_PHOTO_URL);
});

test("employeeApp, Pro, no selfie: no face check", async () => {
  const c = "src-ea-noselfie";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  const { event, awsCalls } = await createAndTrigger(c, "e1", { source: "employeeApp", photoUrl: CLOCK_PHOTO_URL });
  assert.equal(awsCalls, 0);
  assert.equal(event.faceCheck, undefined);
});

test("employeeApp, Core + clock photo + selfie: no face check", async () => {
  const c = "src-ea-core";
  await seedCompany(c, CORE);
  await seedEmployee(c, { withSelfie: true });
  const { event, awsCalls } = await createAndTrigger(c, "e1", { source: "employeeApp", photoUrl: CLOCK_PHOTO_URL });
  assert.equal(awsCalls, 0);
  assert.equal(event.faceCheck, undefined);
});

test("employeeApp, Pro + selfie but no clock photo: no face check", async () => {
  const c = "src-ea-nophoto";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: true });
  const { event, awsCalls } = await createAndTrigger(c, "e1", { source: "employeeApp" });
  assert.equal(awsCalls, 0);
  assert.equal(event.faceCheck, undefined);
});

test("employeeApp clock-in: last status set, pending approval created", async () => {
  const c = "src-ea-status";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: true });
  await createAndTrigger(c, "e1", { source: "employeeApp", photoUrl: CLOCK_PHOTO_URL, siteId: "siteA", siteName: "Site A" });
  const employee = await getDoc(`companies/${c}/employees/emp1`);
  assert.equal(employee.lastEventType, "in");
  assert.equal(employee.lastEventSiteId, "siteA");
  const approval = await getDoc(`companies/${c}/timesheetApprovals/e1`);
  assert.equal(approval.status, "pending");
  assert.equal(approval.siteId, "siteA");
});

// Pro company with a located site at the GPS fix, and the event written for a
// different site. "pin" gets auto-detected onto the nearby site; "employeeApp"
// keeps the site it was written with (Phase 6: employeeClockPunch already
// detected it before the write, so the trigger never touches it).
async function seedNearbySite(companyId) {
  await db.collection("companies").doc(companyId).collection("jobSites").doc("near").set({
    name: "Near Site",
    active: true,
    lat: 29.95,
    lng: -90.07,
    radiusMeters: 200,
    requireGeofence: false,
  });
}
const AT_NEAR_SITE = { location: { lat: 29.95, lng: -90.07 }, locationAccuracyM: 10 };
// About 5 km away from both test sites.
const FAR_AWAY = { location: { lat: 29.995, lng: -90.07 }, locationAccuracyM: 10 };

test("employeeApp keeps its written site (no auto site detection)", async () => {
  const c = "src-ea-site";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  const { event } = await createAndTrigger(c, "e1", {
    source: "employeeApp",
    siteId: "assigned",
    siteName: "Assigned Site",
    ...AT_NEAR_SITE,
  });
  assert.equal(event.siteId, "assigned");
  assert.equal(event.siteName, "Assigned Site");
  assert.equal(event.siteAutoDetected, undefined);
  assert.equal(event.siteCorrected, undefined);
});

test("employeeApp outside every site: the trigger never nulls its site", async () => {
  const c = "src-ea-outside";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  const { event } = await createAndTrigger(c, "e1", {
    source: "employeeApp",
    siteId: "assigned",
    siteName: "Assigned Site",
    ...FAR_AWAY,
  });
  assert.equal(event.siteId, "assigned");
  assert.equal(event.siteName, "Assigned Site");
  assert.equal(event.siteAutoDetected, undefined);
});

// A geofenced site (Phase 6 F5: employeeApp clock-ins get the same
// outside-geofence badge as supervisor punches; breaks never do).
async function seedFencedSite(companyId) {
  await db.collection("companies").doc(companyId).collection("jobSites").doc("fenced").set({
    name: "Fenced Site",
    active: true,
    lat: 29.95,
    lng: -90.07,
    radiusMeters: 100,
    requireGeofence: true,
  });
}

test("employeeApp clock-in outside its fenced site: geofenceStatus outside", async () => {
  const c = "src-ea-fence-out";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedFencedSite(c);
  const { event } = await createAndTrigger(c, "e1", { source: "employeeApp", siteId: "fenced", siteName: "Fenced Site", ...FAR_AWAY });
  assert.equal(event.geofenceStatus, "outside");
  assert.equal(event.siteId, "fenced");
});

test("employeeApp clock-in inside its fenced site: geofenceStatus inside", async () => {
  const c = "src-ea-fence-in";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedFencedSite(c);
  const { event } = await createAndTrigger(c, "e1", { source: "employeeApp", siteId: "fenced", siteName: "Fenced Site", ...AT_NEAR_SITE });
  assert.equal(event.geofenceStatus, "inside");
});

test("employeeApp break with a location: no geofence badge", async () => {
  const c = "src-ea-fence-break";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedFencedSite(c);
  const { event } = await createAndTrigger(c, "e1", { source: "employeeApp", type: "breakStart", siteId: "fenced", siteName: "Fenced Site", ...FAR_AWAY });
  assert.equal(event.geofenceStatus, undefined);
  assert.equal(event.distanceFromSiteM, undefined);
});

test("employeeApp Core with a location: saved as is, no geofence", async () => {
  const c = "src-ea-core-loc";
  await seedCompany(c, CORE);
  await seedEmployee(c, { withSelfie: false });
  await seedFencedSite(c);
  const { event } = await createAndTrigger(c, "e1", { source: "employeeApp", siteId: "fenced", siteName: "Fenced Site", ...FAR_AWAY });
  assert.deepEqual(event.location, FAR_AWAY.location);
  assert.equal(event.geofenceStatus, undefined);
  assert.equal(event.siteId, "fenced");
});

// ---- existing sources, unchanged ----

test("pin still gets auto site detection (unchanged)", async () => {
  const c = "src-pin-site";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  const { event } = await createAndTrigger(c, "e1", {
    source: "pin",
    siteId: "assigned",
    siteName: "Assigned Site",
    ...AT_NEAR_SITE,
  });
  assert.equal(event.siteId, "near");
  assert.equal(event.siteAutoDetected, true);
  assert.equal(event.siteCorrected, true);
});

test("pin outside every site: no site, auto-detected (unchanged after the shared-helper refactor)", async () => {
  const c = "src-pin-outside";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  const { event } = await createAndTrigger(c, "e1", { source: "pin", siteId: "assigned", siteName: "Assigned Site", ...FAR_AWAY });
  assert.equal(event.siteId, null);
  assert.equal(event.siteAutoDetected, true);
  assert.equal(event.siteCorrected, true);
});

test("pin geofence via the shared helper: inside a fenced site / outside every fenced site (unchanged)", async () => {
  const c = "src-pin-fence";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedFencedSite(c);
  const inside = await createAndTrigger(c, "e1", { source: "pin", ...AT_NEAR_SITE });
  assert.equal(inside.event.siteId, "fenced");
  assert.equal(inside.event.geofenceStatus, "inside");
  const outside = await createAndTrigger(c, "e2", { source: "pin", ...FAR_AWAY });
  assert.equal(outside.event.siteId, null);
  assert.equal(outside.event.geofenceStatus, "outside");
  assert.ok(outside.event.distanceFromSiteM > 1000);
});

for (const source of ["pin", "supervisorOverride", "tempLink"]) {
  test(`${source}, Pro + clock photo + selfie: face check runs (unchanged)`, async () => {
    const c = `src-${source}-pro`;
    await seedCompany(c, PRO);
    await seedEmployee(c, { withSelfie: true });
    const { event, awsCalls } = await createAndTrigger(c, "e1", { source, photoUrl: CLOCK_PHOTO_URL });
    assert.equal(awsCalls, 1);
    assert.equal(event.faceCheck.status, "match");
  });
}

test("pin, Core + clock photo + selfie: no face check (unchanged)", async () => {
  const c = "src-pin-core";
  await seedCompany(c, CORE);
  await seedEmployee(c, { withSelfie: true });
  const { event, awsCalls } = await createAndTrigger(c, "e1", { source: "pin", photoUrl: CLOCK_PHOTO_URL });
  assert.equal(awsCalls, 0);
  assert.equal(event.faceCheck, undefined);
});

test("adminManual with no photo: no face check (unchanged)", async () => {
  const c = "src-admin";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: true });
  const { event, awsCalls } = await createAndTrigger(c, "e1", { source: "adminManual" });
  assert.equal(awsCalls, 0);
  assert.equal(event.faceCheck, undefined);
});
