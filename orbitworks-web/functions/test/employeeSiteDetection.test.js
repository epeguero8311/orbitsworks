// Employee App Phase 6 - location on every punch + Pro site detection at
// clock-in, through the REAL employeeClockPunch (lib/) on the Firestore
// emulator. Storage is an in-memory fake, AWS is stubbed (same as
// employeeClock.test.js). Each test uses its own company.
//
// Run: firebase emulators:exec --only firestore "node --test test/employeeSiteDetection.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-sitedetect-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const admin = require("firebase-admin");
const { RekognitionClient } = require("@aws-sdk/client-rekognition");

RekognitionClient.prototype.send = async function () {
  return { FaceMatches: [{ Similarity: 98 }], UnmatchedFaces: [] };
};

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

const files = new Map();
admin.storage().bucket = () => ({
  name: "test-bucket",
  file: (p) => ({
    getMetadata: async () => {
      if (!files.has(p)) {
        const e = new Error("No such object");
        e.code = 404;
        throw e;
      }
      return [files.get(p)];
    },
    setMetadata: async () => [files.get(p)],
    delete: async () => files.delete(p),
    download: async () => [Buffer.from("fake-image-bytes")],
  }),
});

function addPhoto(p) {
  files.set(p, {
    contentType: "image/jpeg",
    size: "2000",
    timeCreated: new Date().toISOString(),
    metadata: { firebaseStorageDownloadTokens: "tok" },
  });
}

const PIN = "1234";
// Site A and site B are ~2.2 km apart; the crew code site is far from both.
const AT_A = { lat: 29.95, lng: -90.07 };
const AT_B = { lat: 29.97, lng: -90.07 };
const NOWHERE = { lat: 30.4, lng: -90.07 };

async function seed(c, { plan = "pro_tier1", employee = {}, sites } = {}) {
  const co = db.collection("companies").doc(c);
  await co.set({ name: "Co " + c, planTier: plan });
  const allSites = sites || {
    siteA: { name: "Site A", active: true, ...AT_A, radiusMeters: 150 },
    siteB: { name: "Site B", active: true, ...AT_B },
    crew: { name: "Crew Site", active: true, lat: 31, lng: -91 },
  };
  for (const [id, s] of Object.entries(allSites)) await co.collection("jobSites").doc(id).set(s);
  await co.collection("employees").doc("emp1").set({
    name: "Ana",
    active: true,
    pin: PIN,
    linkedUserId: "uid1",
    assignedSiteIds: ["siteB"],
    subcontractorId: null,
    subcontractorName: null,
    ...employee,
  });
}

async function seedCrewCode(c) {
  await db.collection("joinCodes").doc("tok-" + c).set({ codeId: "code-" + c, companyId: c, siteId: "crew", createdAt: admin.firestore.Timestamp.fromMillis(1000) });
  await db.doc(`companies/${c}/employees/emp1`).update({ joinCodeId: "code-" + c });
}

const auth = (c) => ({ uid: "uid1", token: { role: "employee", companyId: c, employeeId: "emp1" } });

// Every current app punch is sent from the queue with queuedAtMs.
async function punch(c, action, { at, accuracyM = 10, fixAgoMs = 2000, punchMs = Date.now(), location, requestId = randomUUID() } = {}) {
  const data = { action, requestId, queuedAtMs: punchMs };
  if (location !== undefined) data.location = location;
  else if (at) data.location = { ...at, accuracyM, fixAtMs: punchMs - fixAgoMs };
  if (action === "in" || action === "out") {
    data.pin = PIN;
    data.photoPath = `companies/${c}/clockEvents/emp1/${requestId}.jpg`;
    addPhoto(data.photoPath);
  }
  return funcs.employeeClockPunch.run({ data, auth: auth(c), rawRequest: {} });
}

async function eventOf(c, id) {
  return (await db.doc(`companies/${c}/clockEvents/${id}`).get()).data();
}

// ---- Pro detection at clock-in ----

test("Pro, inside a site: the detected site wins (not the assigned one), location saved", async () => {
  const c = "sd-inside";
  await seed(c);
  const punchMs = Date.now();
  const res = await punch(c, "in", { at: AT_A, punchMs });
  assert.equal(res.siteId, "siteA");
  assert.equal(res.siteName, "Site A");
  const ev = await eventOf(c, res.eventId);
  assert.equal(ev.siteId, "siteA");
  assert.equal(ev.siteAutoDetected, true);
  assert.deepEqual(ev.location, AT_A);
  assert.equal(ev.locationAccuracyM, 10);
  assert.equal(ev.locationFixAtMs, punchMs - 2000);
});

test("Pro, outside every site: Phase 3 rule - crew code site, else single assigned, else none", async () => {
  const c1 = "sd-out-crew";
  await seed(c1);
  await seedCrewCode(c1);
  const r1 = await punch(c1, "in", { at: NOWHERE });
  assert.equal(r1.siteId, "crew");
  assert.equal((await eventOf(c1, r1.eventId)).siteAutoDetected, undefined);

  const c2 = "sd-out-assigned";
  await seed(c2);
  assert.equal((await punch(c2, "in", { at: NOWHERE })).siteId, "siteB");

  const c3 = "sd-out-none";
  await seed(c3, { employee: { assignedSiteIds: ["siteA", "siteB"] } });
  const r3 = await punch(c3, "in", { at: NOWHERE });
  assert.equal(r3.siteId, null);
  assert.equal((await eventOf(c3, r3.eventId)).siteName, "Not specified");
});

test("Pro, inside a site beats the crew code site", async () => {
  const c = "sd-inside-crew";
  await seed(c);
  await seedCrewCode(c);
  assert.equal((await punch(c, "in", { at: AT_A })).siteId, "siteA");
});

test("Pro, no fix: Phase 3 site, location saved as null", async () => {
  const c = "sd-nofix";
  await seed(c);
  const res = await punch(c, "in", { location: null });
  assert.equal(res.siteId, "siteB");
  const ev = await eventOf(c, res.eventId);
  assert.equal(ev.location, null);
  assert.equal(ev.locationAccuracyM, null);
  assert.equal(ev.locationFixAtMs, null);
});

test("Pro, accuracy worse than 500 m (or unknown): no detection, Phase 3 site, fix still saved", async () => {
  const c = "sd-rough";
  await seed(c);
  const res = await punch(c, "in", { at: AT_A, accuracyM: 800 });
  assert.equal(res.siteId, "siteB");
  const ev = await eventOf(c, res.eventId);
  assert.deepEqual(ev.location, AT_A);
  assert.equal(ev.locationAccuracyM, 800);
  assert.equal(ev.siteAutoDetected, undefined);

  const c2 = "sd-noacc";
  await seed(c2);
  assert.equal((await punch(c2, "in", { at: AT_A, accuracyM: null })).siteId, "siteB");

  const c3 = "sd-500";
  await seed(c3);
  assert.equal((await punch(c3, "in", { at: AT_A, accuracyM: 500 })).siteId, "siteA");
});

test("Pro, two overlapping sites: the closest one the fix is inside wins", async () => {
  const c = "sd-overlap";
  await seed(c, {
    sites: {
      big: { name: "Big", active: true, ...AT_A, radiusMeters: 3000 },
      small: { name: "Small", active: true, lat: 29.951, lng: -90.07, radiusMeters: 100 },
    },
  });
  assert.equal((await punch(c, "in", { at: { lat: 29.951, lng: -90.07 } })).siteId, "small");
});

test("Pro, no site has coordinates: Phase 3 site", async () => {
  const c = "sd-unlocated";
  await seed(c, { sites: { siteB: { name: "Site B", active: true } } });
  assert.equal((await punch(c, "in", { at: AT_A })).siteId, "siteB");
});

test("Pro, an inactive site is never detected", async () => {
  const c = "sd-inactive";
  await seed(c, { sites: { siteA: { name: "Site A", active: false, ...AT_A }, siteB: { name: "Site B", active: true } } });
  assert.equal((await punch(c, "in", { at: AT_A })).siteId, "siteB");
});

// ---- Core ----

test("Core, inside a site: no detection (Phase 3 site), location still saved", async () => {
  const c = "sd-core";
  await seed(c, { plan: "core2_tier1" });
  const res = await punch(c, "in", { at: AT_A });
  assert.equal(res.siteId, "siteB");
  const ev = await eventOf(c, res.eventId);
  assert.deepEqual(ev.location, AT_A);
  assert.equal(ev.siteAutoDetected, undefined);
});

// ---- shift: out and breaks ----

test("clock out and breaks copy the detected clock-in site; each saves its own location", async () => {
  const c = "sd-shift";
  await seed(c);
  const t0 = Date.now() - 60 * 60 * 1000;
  const rin = await punch(c, "in", { at: AT_A, punchMs: t0 });
  assert.equal(rin.siteId, "siteA");
  const rbs = await punch(c, "breakStart", { at: AT_B, punchMs: t0 + 60000 });
  const rbe = await punch(c, "breakEnd", { location: null, punchMs: t0 + 120000 });
  const rout = await punch(c, "out", { at: NOWHERE, punchMs: t0 + 180000 });
  for (const r of [rbs, rbe, rout]) assert.equal(r.siteId, "siteA");
  assert.deepEqual((await eventOf(c, rbs.eventId)).location, AT_B);
  assert.equal((await eventOf(c, rbe.eventId)).location, null);
  const out = await eventOf(c, rout.eventId);
  assert.deepEqual(out.location, NOWHERE);
  assert.equal(out.siteAutoDetected, undefined);
});

// ---- offline / time window ----

test("offline punch synced hours later: a fix near its own time counts (detected)", async () => {
  const c = "sd-offline";
  await seed(c);
  const madeMs = Date.now() - 3 * 60 * 60 * 1000;
  const res = await punch(c, "in", { at: AT_A, punchMs: madeMs, fixAgoMs: 4 * 60 * 1000 });
  assert.equal(res.siteId, "siteA");
  const ev = await eventOf(c, res.eventId);
  assert.equal(ev.queued, true);
  assert.deepEqual(ev.location, AT_A);
});

test("fix more than 5 min before (or 1 min after) the punch: punch saves, location dropped, no detection", async () => {
  const c = "sd-stale";
  await seed(c);
  const res = await punch(c, "in", { at: AT_A, fixAgoMs: 5 * 60 * 1000 + 1000 });
  assert.equal(res.siteId, "siteB");
  const ev = await eventOf(c, res.eventId);
  assert.equal(ev.location, null);
  assert.equal(ev.locationFixAtMs, null);

  const c2 = "sd-future";
  await seed(c2);
  const r2 = await punch(c2, "in", { at: AT_A, fixAgoMs: -(60 * 1000 + 1000) });
  assert.equal(r2.siteId, "siteB");
  assert.equal((await eventOf(c2, r2.eventId)).location, null);
});

test("a malformed location never rejects the punch: saved as null", async () => {
  const c = "sd-bad";
  await seed(c);
  const res = await punch(c, "in", { location: { lat: 999, lng: "x" } });
  assert.equal(res.siteId, "siteB");
  assert.equal((await eventOf(c, res.eventId)).location, null);
});

test("older app (no location field): no location keys written, Phase 3 site", async () => {
  const c = "sd-oldapp";
  await seed(c);
  const res = await punch(c, "in");
  assert.equal(res.siteId, "siteB");
  const ev = await eventOf(c, res.eventId);
  assert.equal("location" in ev, false);
  assert.equal("locationAccuracyM" in ev, false);
  assert.equal("locationFixAtMs" in ev, false);
});

// ---- trigger ----

test("the trigger keeps the detected site; timesheet approval and last site use it", async () => {
  const c = "sd-trigger";
  await seed(c);
  const res = await punch(c, "in", { at: AT_A });
  const ref = db.doc(`companies/${c}/clockEvents/${res.eventId}`);
  const data = (await ref.get()).data();
  await funcs.onClockEventCreated.run({ params: { companyId: c, eventId: res.eventId }, data: { data: () => data, ref } });
  const ev = (await ref.get()).data();
  assert.equal(ev.siteId, "siteA");
  assert.equal(ev.siteCorrected, undefined);
  const approval = (await db.doc(`companies/${c}/timesheetApprovals/${res.eventId}`).get()).data();
  assert.equal(approval.siteId, "siteA");
  const emp = (await db.doc(`companies/${c}/employees/emp1`).get()).data();
  assert.equal(emp.lastEventSiteId, "siteA");
});

// ---- site mismatch (same rule as supervisor pin punches) ----

test("mismatch: detected site not in assigned sites -> siteMismatch set", async () => {
  const c = "sd-mm-set";
  await seed(c); // assigned to siteB only
  const res = await punch(c, "in", { at: AT_A });
  assert.equal(res.siteId, "siteA");
  assert.equal((await eventOf(c, res.eventId)).siteMismatch, true);
});

test("mismatch: detected site is one of the assigned sites -> not set", async () => {
  const c = "sd-mm-assigned";
  await seed(c, { employee: { assignedSiteIds: ["siteA", "siteB"] } });
  const res = await punch(c, "in", { at: AT_A });
  assert.equal(res.siteId, "siteA");
  assert.equal((await eventOf(c, res.eventId)).siteMismatch, undefined);
});

test("mismatch: employee with no assigned sites -> never set", async () => {
  const c = "sd-mm-none";
  await seed(c, { employee: { assignedSiteIds: [] } });
  const res = await punch(c, "in", { at: AT_A });
  assert.equal(res.siteId, "siteA");
  assert.equal((await eventOf(c, res.eventId)).siteMismatch, undefined);
});

test("mismatch: no detection (outside, rough fix, Core) -> never set", async () => {
  const c1 = "sd-mm-outside";
  await seed(c1, { employee: { assignedSiteIds: ["siteB"] } });
  await seedCrewCode(c1);
  const r1 = await punch(c1, "in", { at: NOWHERE });
  assert.equal(r1.siteId, "crew");
  assert.equal((await eventOf(c1, r1.eventId)).siteMismatch, undefined);

  const c2 = "sd-mm-rough";
  await seed(c2);
  const r2 = await punch(c2, "in", { at: AT_A, accuracyM: 800 });
  assert.equal((await eventOf(c2, r2.eventId)).siteMismatch, undefined);

  const c3 = "sd-mm-core";
  await seed(c3, { plan: "core2_tier1" });
  const r3 = await punch(c3, "in", { at: AT_A });
  assert.equal(r3.siteId, "siteB");
  const ev3 = await eventOf(c3, r3.eventId);
  assert.equal(ev3.siteMismatch, undefined);
  assert.equal(ev3.siteAutoDetected, undefined);
});

test("mismatch: clock out and breaks never carry it", async () => {
  const c = "sd-mm-shift";
  await seed(c);
  const t0 = Date.now() - 60 * 60 * 1000;
  await punch(c, "in", { at: AT_A, punchMs: t0 });
  const rb = await punch(c, "breakStart", { at: AT_A, punchMs: t0 + 60000 });
  const re = await punch(c, "breakEnd", { at: AT_A, punchMs: t0 + 120000 });
  const ro = await punch(c, "out", { at: AT_A, punchMs: t0 + 180000 });
  for (const r of [rb, re, ro]) assert.equal((await eventOf(c, r.eventId)).siteMismatch, undefined);
});

test("mismatch: the trigger raises the existing siteMismatch alert for an employeeApp clock-in", async () => {
  const c = "sd-mm-alert";
  await seed(c);
  const res = await punch(c, "in", { at: AT_A });
  const ref = db.doc(`companies/${c}/clockEvents/${res.eventId}`);
  const data = (await ref.get()).data();
  process.env.ALERTS_FEED_ENABLED = "true";
  try {
    await funcs.onClockEventCreated.run({ params: { companyId: c, eventId: res.eventId }, data: { data: () => data, ref } });
  } finally {
    process.env.ALERTS_FEED_ENABLED = "false";
  }
  const alerts = await db.collection(`companies/${c}/alerts`).where("alertType", "==", "siteMismatch").get();
  assert.equal(alerts.size, 1);
  assert.equal(alerts.docs[0].data().siteId, "siteA");
  assert.equal((await ref.get()).data().siteMismatch, true);
});
