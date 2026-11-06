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

// appSettings: Phase 10 D16 a - "Ask for job site each time" (missing =
// on, the website default) keeps the supervisor's pick.
async function seedCompany(companyId, planTier, appSettings) {
  await db.collection("companies").doc(companyId).set({ planTier, ...(appSettings ? { appSettings } : {}) });
}
const DETECT = { askJobSiteEachTime: false };

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

test("employeeApp clock-in with no site (Not specified): fenced-only check, outside + distance to the nearest fenced site (E3 b)", async () => {
  const c = "src-ea-nosite-out";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedFencedSite(c);
  const { event } = await createAndTrigger(c, "e1", { source: "employeeApp", siteId: null, siteName: "Not specified", ...FAR_AWAY });
  assert.equal(event.siteId, null);
  assert.equal(event.geofenceStatus, "outside");
  assert.ok(event.distanceFromSiteM > 1000);
});

test("employeeApp clock-in with no site: no badge when the company has no geofenced site; never on a break; a no-site clock-out too (fix round 2)", async () => {
  const c = "src-ea-nosite-nofence";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  const a = await createAndTrigger(c, "e1", { source: "employeeApp", siteId: null, siteName: "Not specified", ...FAR_AWAY });
  assert.equal(a.event.geofenceStatus, undefined);
  const c2 = "src-ea-nosite-out-type";
  await seedCompany(c2, PRO);
  await seedEmployee(c2, { withSelfie: false });
  await seedFencedSite(c2);
  const b = await createAndTrigger(c2, "e1", { source: "employeeApp", type: "breakStart", siteId: null, siteName: "Not specified", ...FAR_AWAY });
  assert.equal(b.event.geofenceStatus, undefined, "never on a break");
  const o = await createAndTrigger(c2, "e2", { source: "employeeApp", type: "out", siteId: null, siteName: "Not specified", ...FAR_AWAY });
  assert.equal(o.event.geofenceStatus, "outside", "fix round 2: a clock-out with no site gets the check too");
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
  await seedCompany(c, PRO, DETECT);
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

test("pin mismatch via the shared isSiteMismatch: set when not assigned, not when assigned (unchanged)", async () => {
  const c = "src-pin-mismatch";
  await seedCompany(c, PRO, DETECT);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  await db.doc(`companies/${c}/employees/emp1`).update({ assignedSiteIds: ["other"] });
  const a = await createAndTrigger(c, "e1", { source: "pin", ...AT_NEAR_SITE });
  assert.equal(a.event.siteMismatch, true);
  await db.doc(`companies/${c}/employees/emp1`).update({ assignedSiteIds: ["near"] });
  const b = await createAndTrigger(c, "e2", { source: "pin", ...AT_NEAR_SITE });
  assert.equal(b.event.siteMismatch, undefined);
});

test("pin outside every site: no site, auto-detected (unchanged after the shared-helper refactor)", async () => {
  const c = "src-pin-outside";
  await seedCompany(c, PRO, DETECT);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  const { event } = await createAndTrigger(c, "e1", { source: "pin", siteId: "assigned", siteName: "Assigned Site", ...FAR_AWAY });
  assert.equal(event.siteId, null);
  assert.equal(event.siteAutoDetected, true);
  assert.equal(event.siteCorrected, true);
});

test("pin geofence via the shared helper: inside a fenced site / outside every fenced site (unchanged)", async () => {
  const c = "src-pin-fence";
  await seedCompany(c, PRO, DETECT);
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

// ---- Phase 10 F1/F2 on the supervisor app (D15 b, D16 a, D18 b) ----

test("pin, Ask for job site each time on (or never saved): the pick is kept, never re-detected", async () => {
  for (const [c, settings] of [["src-ask-on", { askJobSiteEachTime: true }], ["src-ask-missing", undefined]]) {
    await seedCompany(c, PRO, settings);
    await seedEmployee(c, { withSelfie: false });
    await seedNearbySite(c);
    const { event } = await createAndTrigger(c, "e1", { source: "pin", siteId: "assigned", siteName: "Assigned Site", ...AT_NEAR_SITE });
    assert.equal(event.siteId, "assigned", c);
    assert.equal(event.siteAutoDetected, undefined, c);
    assert.equal(event.siteCorrected, undefined, c);
  }
});

test("pin, ask on: a kept fenced pick still gets its own geofence badge", async () => {
  const c = "src-ask-fence";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedFencedSite(c);
  const { event } = await createAndTrigger(c, "e1", { source: "pin", siteId: "fenced", siteName: "Fenced Site", ...FAR_AWAY });
  assert.equal(event.siteId, "fenced");
  assert.equal(event.geofenceStatus, "outside");
});

test("pin, no usable fix (none, no accuracy, worse than 500 m): the pick is kept (D15 b)", async () => {
  const c = "src-pin-nofix";
  await seedCompany(c, PRO, DETECT);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  const cases = [
    { location: null, locationAccuracyM: null },
    { location: { lat: 29.95, lng: -90.07 }, locationAccuracyM: null },
    { location: { lat: 29.95, lng: -90.07 }, locationAccuracyM: 800 },
  ];
  for (const [i, fix] of cases.entries()) {
    const { event } = await createAndTrigger(c, "e" + i, { source: "pin", siteId: "assigned", siteName: "Assigned Site", ...fix });
    assert.equal(event.siteId, "assigned", JSON.stringify(fix));
    assert.equal(event.siteAutoDetected, undefined);
  }
});

test("pin, 100-500 m fix: an assigned site matches, an unassigned one keeps the pick (D18 b)", async () => {
  const c = "src-pin-rough";
  await seedCompany(c, PRO, DETECT);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  const rough = { location: { lat: 29.95, lng: -90.07 }, locationAccuracyM: 300 };
  const a = await createAndTrigger(c, "e1", { source: "pin", siteId: "assigned", siteName: "Assigned Site", ...rough });
  assert.equal(a.event.siteId, "assigned", "near is unassigned: not trusted at 300 m");
  await db.doc(`companies/${c}/employees/emp1`).update({ assignedSiteIds: ["near"] });
  const b = await createAndTrigger(c, "e2", { source: "pin", siteId: "assigned", siteName: "Assigned Site", ...rough });
  assert.equal(b.event.siteId, "near");
  assert.equal(b.event.siteAutoDetected, true);
});

// ---- Fix round 2 (F a): a supervisor clock-out is its own detection ----

async function setShiftSite(c, siteId, siteName) {
  await db.doc(`companies/${c}/employees/emp1`).update({ lastEventSiteId: siteId, lastEventSiteName: siteName, assignedSiteIds: ["shift"] });
}

test("pin clock-out, ask off: detected at its own site, tagged; no mismatch flag on a clock-out (H a)", async () => {
  const c = "src-out-detect";
  await seedCompany(c, PRO, DETECT);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  await setShiftSite(c, "shift", "Shift Site");
  const { event } = await createAndTrigger(c, "o1", { source: "pin", type: "out", siteId: "shift", siteName: "Shift Site", ...AT_NEAR_SITE });
  assert.equal(event.siteId, "near");
  assert.equal(event.siteAutoDetected, true);
  assert.equal(event.siteMismatch, undefined);
  const emp = await getDoc(`companies/${c}/employees/emp1`);
  assert.equal(emp.lastEventSiteId, "near");
});

test("pin clock-out, ask off, good fix inside no site: no site", async () => {
  const c = "src-out-nomatch";
  await seedCompany(c, PRO, DETECT);
  await seedEmployee(c, { withSelfie: false });
  await seedNearbySite(c);
  await setShiftSite(c, "shift", "Shift Site");
  const { event } = await createAndTrigger(c, "o1", { source: "pin", type: "out", siteId: "shift", siteName: "Shift Site", ...FAR_AWAY });
  assert.equal(event.siteId, null);
});

test("pin clock-out falls back to the clock-in site with no Auto-detected tag: ask on, no fix, rough fix", async () => {
  const cases = [
    ["src-out-ask", undefined, AT_NEAR_SITE],
    ["src-out-nofix", DETECT, { location: null, locationAccuracyM: null }],
    ["src-out-roughfix", DETECT, { location: { lat: 29.95, lng: -90.07 }, locationAccuracyM: 300 }],
  ];
  for (const [c, settings, fix] of cases) {
    await seedCompany(c, PRO, settings);
    await seedEmployee(c, { withSelfie: false });
    await seedNearbySite(c);
    await setShiftSite(c, "shift", "Shift Site");
    const { event } = await createAndTrigger(c, "o1", { source: "pin", type: "out", siteId: "shift", siteName: "Shift Site", ...fix });
    assert.equal(event.siteId, "shift", c);
    assert.equal(event.siteAutoDetected, undefined, c);
  }
});

test("pin clock-out geofence badge (D a): the detected site's fence, else the clock-in site's", async () => {
  const c = "src-out-fence";
  await seedCompany(c, PRO, DETECT);
  await seedEmployee(c, { withSelfie: false });
  await seedFencedSite(c);
  await setShiftSite(c, "fenced", "Fenced Site");
  const inside = await createAndTrigger(c, "o1", { source: "pin", type: "out", siteId: "fenced", siteName: "Fenced Site", ...AT_NEAR_SITE });
  assert.equal(inside.event.geofenceStatus, "inside");
  const c2 = "src-out-fence-ask";
  await seedCompany(c2, PRO);
  await seedEmployee(c2, { withSelfie: false });
  await seedFencedSite(c2);
  await setShiftSite(c2, "fenced", "Fenced Site");
  const kept = await createAndTrigger(c2, "o1", { source: "pin", type: "out", siteId: "fenced", siteName: "Fenced Site", ...FAR_AWAY });
  assert.equal(kept.event.siteId, "fenced");
  assert.equal(kept.event.geofenceStatus, "outside");
});

// ---- Phase 10 D19 a: supervisor breaks + override clock-out copy the shift site ----

const T = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));

test("supervisor break, auto break end and override clock-out take the shift's clock-in site", async () => {
  const c = "src-copy-site";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await createAndTrigger(c, "in1", { source: "supervisorOverride", siteId: "near", siteName: "Near Site", timestamp: T("2026-10-21T14:00:00Z") });
  const bs = await createAndTrigger(c, "bs", { source: "supervisorPin", type: "breakStart", timestamp: T("2026-10-21T16:00:00Z") });
  assert.equal(bs.event.siteId, "near");
  assert.equal(bs.event.siteName, "Near Site");
  const be = await createAndTrigger(c, "be", { source: "autoBreakEnd", type: "breakEnd", timestamp: T("2026-10-21T16:20:00Z") });
  assert.equal(be.event.siteId, "near");
  const out = await createAndTrigger(c, "out", { source: "supervisorOverride", type: "out", siteId: "pill", siteName: "Pill Site", timestamp: T("2026-10-21T22:00:00Z") });
  assert.equal(out.event.siteId, "near", "never the site filter pill");
  assert.equal(out.event.siteAutoDetected, undefined);
  const emp = await getDoc(`companies/${c}/employees/emp1`);
  assert.equal(emp.lastEventSiteId, "near");
});

test("override clock-out with a fix: the geofence badge is checked against the copied shift site, not the pill", async () => {
  const c = "src-copy-fence";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await seedFencedSite(c);
  await createAndTrigger(c, "in1", { source: "supervisorOverride", siteId: "fenced", siteName: "Fenced Site", timestamp: T("2026-10-21T14:00:00Z") });
  const out = await createAndTrigger(c, "out", {
    source: "supervisorOverride",
    type: "out",
    siteId: "pill",
    siteName: "Pill Site",
    timestamp: T("2026-10-21T22:00:00Z"),
    ...FAR_AWAY,
  });
  assert.equal(out.event.siteId, "fenced");
  assert.equal(out.event.geofenceStatus, "outside");
});

test("shift site copy: clock-in with no site = Not specified; the right shift by time; no clock-in = unchanged", async () => {
  const c = "src-copy-edges";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  const none = await createAndTrigger(c, "bs0", { source: "supervisorPin", type: "breakStart", siteId: "x", siteName: "X", timestamp: T("2026-10-20T10:00:00Z") });
  assert.equal(none.event.siteId, "x", "no clock-in yet: nothing changes");
  await createAndTrigger(c, "in1", { source: "pin", siteId: null, siteName: "Not specified", timestamp: T("2026-10-21T08:00:00Z") });
  await createAndTrigger(c, "in2", { source: "supervisorOverride", siteId: "later", siteName: "Later", timestamp: T("2026-10-22T08:00:00Z") });
  const bs = await createAndTrigger(c, "bs1", { source: "supervisorPin", type: "breakStart", siteId: "x", siteName: "X", timestamp: T("2026-10-21T12:00:00Z") });
  assert.equal(bs.event.siteId, null, "its own shift (in1), not the later one");
  assert.equal(bs.event.siteName, "Not specified");
});

test("shift site copy never touches adminManual breaks, Employee App breaks or override clock-ins", async () => {
  const c = "src-copy-skip";
  await seedCompany(c, PRO);
  await seedEmployee(c, { withSelfie: false });
  await createAndTrigger(c, "in1", { source: "supervisorOverride", siteId: "near", siteName: "Near Site", timestamp: T("2026-10-21T08:00:00Z") });
  const admin1 = await createAndTrigger(c, "bs-admin", { source: "adminManual", type: "breakStart", siteId: "chosen", siteName: "Chosen", timestamp: T("2026-10-21T10:00:00Z") });
  assert.equal(admin1.event.siteId, "chosen");
  const ea = await createAndTrigger(c, "bs-ea", { source: "employeeApp", type: "breakStart", siteId: "own", siteName: "Own", timestamp: T("2026-10-21T11:00:00Z") });
  assert.equal(ea.event.siteId, "own");
  const oin = await createAndTrigger(c, "in2", { source: "supervisorOverride", siteId: "pill", siteName: "Pill", timestamp: T("2026-10-21T12:00:00Z") });
  assert.equal(oin.event.siteId, "pill");
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
