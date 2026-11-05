// Employee App Phase 8 - leaving the job site, through the REAL callables
// (employeeClockPunch, getEmployeeHomeSite, recordSiteExit, getShiftFence,
// acceptLocationConsent) and onClockEventCreated on the Firestore emulator.
// Storage is an in-memory fake, AWS is stubbed (same as
// employeeSiteDetection.test.js). Each test uses its own company.
//
// Run: firebase emulators:exec --only firestore "node --test test/employeeSiteExits.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-siteexit-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "true";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "true";
delete process.env.TEST_COMPANY_IDS;

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const admin = require("firebase-admin");
const { RekognitionClient } = require("@aws-sdk/client-rekognition");
const { Expo } = require("expo-server-sdk");

RekognitionClient.prototype.send = async function () {
  return { FaceMatches: [{ Similarity: 98 }], UnmatchedFaces: [] };
};
let pushes = [];
Expo.prototype.sendPushNotificationsAsync = async (messages) => {
  pushes.push(...messages);
  return messages.map(() => ({ status: "ok" }));
};

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");
const siteExits = require("../lib/employeeSiteExits.js");
const { LOCATION_CONSENT_VERSION, PRIVACY_POLICY_VERSION } = require("../lib/consentVersions.js");

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
  files.set(p, { contentType: "image/jpeg", size: "2000", timeCreated: new Date().toISOString(), metadata: { firebaseStorageDownloadTokens: "tok" } });
}

const PIN = "1234";
const MIN = 60 * 1000;
const SITE = { lat: 29.95, lng: -90.07 };
// ~300 m north of the site (radius 150 m): outside by any buffer.
const AWAY = { lat: 29.95 + 300 / 111195, lng: -90.07 };
const fix = (at, ms, accuracyM = 10) => ({ ...at, accuracyM, fixAtMs: ms });

async function seed(c, { plan = "pro_tier1", fenced = true, consent = true, radiusMeters = 150 } = {}) {
  const co = db.collection("companies").doc(c);
  await co.set({ name: "Co " + c, planTier: plan });
  await co.collection("jobSites").doc("site1").set({ name: "Riverside", active: true, ...SITE, radiusMeters, requireGeofence: fenced });
  await co.collection("employees").doc("emp1").set({
    name: "Ana",
    active: true,
    pin: PIN,
    linkedUserId: "uid1",
    assignedSiteIds: ["site1"],
    subcontractorId: null,
    subcontractorName: null,
  });
  if (consent) {
    await co.collection("employeeConsents").doc("emp1").set({ locationConsentVersion: LOCATION_CONSENT_VERSION, locationPrivacyVersion: PRIVACY_POLICY_VERSION });
  }
  await co.collection("employeePushTokens").doc("emp1").set({ employeeId: "emp1", token: "ExponentPushToken[ana]", platform: "ios" });
}

const auth = (c) => ({ uid: "uid1", token: { role: "employee", companyId: c, employeeId: "emp1" } });
const call = (fn, c, data) => funcs[fn].run({ data, auth: auth(c), rawRequest: {} });

async function punch(c, action, { punchMs = Date.now(), at = SITE, requestId = randomUUID() } = {}) {
  const data = { action, requestId, queuedAtMs: punchMs, location: fix(at, punchMs - 1000) };
  if (action === "in" || action === "out") {
    data.pin = PIN;
    data.photoPath = `companies/${c}/clockEvents/emp1/${requestId}.jpg`;
    addPhoto(data.photoPath);
  }
  return call("employeeClockPunch", c, data);
}

const exitDoc = async (c, id) => (await db.doc(`companies/${c}/siteExits/${id}`).get()).data();
const event = async (c, id) => (await db.doc(`companies/${c}/clockEvents/${id}`).get()).data();
const left = (shift, atMs, o = {}) => ({ exitId: randomUUID(), clockInEventId: shift, kind: "left", phase: "start", atMs, location: fix(AWAY, atMs), ...o });

// Runs onClockEventCreated for an event already written (as the trigger would).
async function trigger(c, eventId) {
  const ref = db.doc(`companies/${c}/clockEvents/${eventId}`);
  const data = (await ref.get()).data();
  await funcs.onClockEventCreated.run({ params: { companyId: c, eventId }, data: { data: () => data, ref } });
}

// ---- clock-in: radius locked, fence returned ----

test("Pro + geofenced site: clock-in locks the radius and returns the fence; a replay returns it again", async () => {
  const c = "se-lock";
  await seed(c);
  const requestId = randomUUID();
  const res = await punch(c, "in", { requestId });
  assert.deepEqual(res.fence, { ...SITE, radiusM: 150 });
  assert.equal((await event(c, res.eventId)).geofenceRadiusM, 150);
  const again = await punch(c, "in", { requestId });
  assert.equal(again.replayed, true);
  assert.deepEqual(again.fence, { ...SITE, radiusM: 150 });
});

test("Core, or a site with the geofence off: no radius, no fence - the punch is the same", async () => {
  for (const [c, o] of [["se-core", { plan: "core_tier1" }], ["se-off", { fenced: false }]]) {
    await seed(c, o);
    const res = await punch(c, "in");
    assert.equal(res.fence, null);
    assert.equal(res.siteId, "site1");
    assert.equal((await event(c, res.eventId)).geofenceRadiusM, undefined);
  }
});

test("clock-out and breaks never carry a fence", async () => {
  const c = "se-out";
  await seed(c);
  await punch(c, "in", { punchMs: Date.now() - 10 * MIN });
  assert.equal((await punch(c, "breakStart", { punchMs: Date.now() - 5 * MIN })).fence, null);
  assert.equal((await punch(c, "breakEnd", { punchMs: Date.now() - 4 * MIN })).fence, null);
  assert.equal((await punch(c, "out")).fence, null);
});

test("home site carries its fence (for an offline clock-in) on Pro only", async () => {
  await seed("se-home");
  assert.deepEqual((await call("getEmployeeHomeSite", "se-home", {})).fence, { ...SITE, radiusM: 150 });
  await seed("se-home-core", { plan: "core_tier1" });
  assert.equal((await call("getEmployeeHomeSite", "se-home-core", {})).fence, null);
});

// ---- recordSiteExit ----

test("left outside: saved once, feed alert (no push) + the employee's own leftSite alert (no push)", async () => {
  const c = "se-left";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 20 * MIN })).eventId;
  pushes = [];
  const input = left(shift, Date.now() - 10 * MIN);
  const r = await call("recordSiteExit", c, input);
  assert.deepEqual(r, { ok: true, recorded: true, tracking: true });
  const doc = await exitDoc(c, input.exitId);
  assert.equal(doc.kind, "left");
  assert.equal(doc.employeeId, "emp1");
  assert.equal(doc.siteId, "site1");
  assert.equal(doc.siteName, "Riverside");
  assert.equal(doc.startMs, input.atMs);
  assert.equal(doc.endMs, null);
  assert.equal(doc.onBreak, false);
  assert.equal(doc.hasLocation, true);
  assert.deepEqual(doc.startLocation, AWAY);
  assert.ok(doc.distanceM >= 290 && doc.distanceM <= 310);
  assert.equal(doc.queued, true);

  const alerts = await db.collection(`companies/${c}/alerts`).where("alertType", "==", "leftJobSite").get();
  assert.equal(alerts.size, 1);
  assert.equal(alerts.docs[0].id.startsWith(`left-${input.exitId}-`), true);
  assert.equal(alerts.docs[0].data().eventId, shift);
  assert.match(alerts.docs[0].data().message, /^Left Riverside at \d{1,2}:\d{2} [AP]M \(\d+ ft away\)$/);
  const mine = await db.doc(`companies/${c}/employeeAlerts/leftSite-${input.exitId}`).get();
  assert.equal(mine.data().title, "You have left the job site");
  assert.equal(mine.data().shiftId, shift);
  assert.equal(pushes.length, 0);

  // Resend: nothing new.
  assert.deepEqual(await call("recordSiteExit", c, input), { ok: true, recorded: false, tracking: true });
  assert.equal((await db.collection(`companies/${c}/alerts`).get()).size, 1);
});

test("return ends the stretch; a second end changes nothing", async () => {
  const c = "se-return";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 20 * MIN })).eventId;
  const start = left(shift, Date.now() - 10 * MIN);
  await call("recordSiteExit", c, start);
  const backMs = Date.now() - 5 * MIN;
  const end = { ...start, phase: "end", atMs: backMs, location: fix(SITE, backMs) };
  assert.equal((await call("recordSiteExit", c, end)).recorded, true);
  const doc = await exitDoc(c, start.exitId);
  assert.equal(doc.endMs, backMs);
  assert.equal(doc.endReason, "returned");
  assert.deepEqual(doc.endLocation, SITE);
  assert.equal((await call("recordSiteExit", c, { ...end, atMs: backMs + MIN })).recorded, false);
  assert.equal((await exitDoc(c, start.exitId)).endMs, backMs);
});

test("G3 c: back within 3 min removes the feed alert; the employee's own entry stays; 3+ min keeps it", async () => {
  const c = "se-short";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 30 * MIN })).eventId;
  const feed = () => db.collection(`companies/${c}/alerts`).where("alertType", "==", "leftJobSite").get();

  const short = left(shift, Date.now() - 20 * MIN);
  await call("recordSiteExit", c, short);
  assert.equal((await feed()).size, 1);
  const backShort = short.atMs + 2.5 * MIN;
  assert.equal((await call("recordSiteExit", c, { ...short, phase: "end", atMs: backShort, location: fix(SITE, backShort) })).recorded, true);
  assert.equal((await feed()).size, 0);
  assert.ok((await db.doc(`companies/${c}/employeeAlerts/leftSite-${short.exitId}`).get()).exists);
  assert.equal((await exitDoc(c, short.exitId)).endReason, "returned");

  const long = left(shift, Date.now() - 10 * MIN);
  await call("recordSiteExit", c, long);
  const backLong = long.atMs + 3 * MIN;
  await call("recordSiteExit", c, { ...long, phase: "end", atMs: backLong, location: fix(SITE, backLong) });
  const left2 = await feed();
  assert.equal(left2.size, 1);
  assert.equal(left2.docs[0].data().siteExitId, long.exitId);
});

test("D8: an exit that doesn't hold up against the real site is dropped (inside, rough fix, no fix)", async () => {
  const c = "se-drop";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 20 * MIN })).eventId;
  const at = Date.now() - 5 * MIN;
  for (const [location, why] of [[fix(SITE, at), "inside"], [fix(AWAY, at, 150), "rough"], [null, "none"]]) {
    const input = left(shift, at, { location });
    const r = await call("recordSiteExit", c, input);
    assert.equal(r.recorded, false, why);
    assert.equal(r.dropped, "notOutside", why);
    assert.equal(await exitDoc(c, input.exitId), undefined, why);
  }
});

test("no location consent: a left is dropped; tracking off (no place saved) is still recorded", async () => {
  const c = "se-consent";
  await seed(c, { consent: false });
  const shift = (await punch(c, "in", { punchMs: Date.now() - 20 * MIN })).eventId;
  assert.equal((await call("recordSiteExit", c, left(shift, Date.now() - 5 * MIN))).dropped, "noConsent");
  const off = { exitId: randomUUID(), clockInEventId: shift, kind: "trackingOff", phase: "start", atMs: Date.now() - 4 * MIN, offReason: "permission" };
  assert.equal((await call("recordSiteExit", c, off)).recorded, true);
  const doc = await exitDoc(c, off.exitId);
  assert.equal(doc.offReason, "permission");
  assert.equal(doc.hasLocation, false);
  assert.equal(doc.startLocation, null);
});

test("D10: leaving on a break is saved as onBreak with no alerts", async () => {
  const c = "se-break";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 30 * MIN })).eventId;
  await punch(c, "breakStart", { punchMs: Date.now() - 20 * MIN });
  const input = left(shift, Date.now() - 15 * MIN);
  assert.equal((await call("recordSiteExit", c, input)).recorded, true);
  assert.equal((await exitDoc(c, input.exitId)).onBreak, true);
  assert.equal((await db.collection(`companies/${c}/alerts`).get()).size, 0);
  assert.equal((await db.collection(`companies/${c}/employeeAlerts`).get()).size, 0);
  // After the break ends it counts again.
  await punch(c, "breakEnd", { punchMs: Date.now() - 10 * MIN });
  const after = left(shift, Date.now() - 5 * MIN);
  await call("recordSiteExit", c, after);
  assert.equal((await exitDoc(c, after.exitId)).onBreak, false);
});

test("the feed alert follows the company's leftJobSiteAlert toggle (default on)", async () => {
  const c = "se-toggle-alert";
  await seed(c);
  await db.doc(`companies/${c}`).update({ alerts: { leftJobSiteAlert: false } });
  const shift = (await punch(c, "in", { punchMs: Date.now() - 20 * MIN })).eventId;
  await call("recordSiteExit", c, left(shift, Date.now() - 5 * MIN));
  assert.equal((await db.collection(`companies/${c}/alerts`).get()).size, 0);
  assert.equal((await db.collection(`companies/${c}/employeeAlerts`).get()).size, 1);
});

test("D12: toggle off or a drop to Core mid-shift stops tracking; radius stays locked at clock-in", async () => {
  const c = "se-midshift";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 20 * MIN })).eventId;
  // A bigger radius later doesn't move the shift's fence.
  await db.doc(`companies/${c}/jobSites/site1`).update({ radiusMeters: 1000 });
  assert.deepEqual(await call("getShiftFence", c, { clockInEventId: shift }), { tracking: true, fence: { ...SITE, radiusM: 150 }, siteName: "Riverside" });
  assert.equal((await call("recordSiteExit", c, left(shift, Date.now() - 5 * MIN))).recorded, true);

  await db.doc(`companies/${c}/jobSites/site1`).update({ requireGeofence: false });
  assert.deepEqual(await call("getShiftFence", c, { clockInEventId: shift }), { tracking: false, fence: null, siteName: null });
  const r = await call("recordSiteExit", c, left(shift, Date.now() - 4 * MIN));
  assert.equal(r.tracking, false);
  assert.equal(r.dropped, "fenceOff");

  await db.doc(`companies/${c}/jobSites/site1`).update({ requireGeofence: true });
  await db.doc(`companies/${c}`).update({ planTier: "core_tier1" });
  assert.equal((await call("recordSiteExit", c, left(shift, Date.now() - 3 * MIN))).dropped, "notPro");
});

test("D11: a shift not started on the employee's own phone is never tracked", async () => {
  const c = "se-supervisor";
  await seed(c);
  const id = randomUUID();
  await db.doc(`companies/${c}/clockEvents/${id}`).set({
    employeeId: "emp1",
    type: "in",
    source: "pin",
    siteId: "site1",
    siteName: "Riverside",
    geofenceRadiusM: 150,
    timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 20 * MIN),
  });
  const r = await call("recordSiteExit", c, left(id, Date.now() - 5 * MIN));
  assert.deepEqual(r, { ok: true, recorded: false, tracking: false, dropped: "noShift" });
  assert.equal((await call("getShiftFence", c, { clockInEventId: id })).tracking, false);
});

test("times outside the shift are dropped (before clock-in, in the future, after clock-out)", async () => {
  const c = "se-window";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 30 * MIN })).eventId;
  assert.equal((await call("recordSiteExit", c, left(shift, Date.now() - 40 * MIN))).dropped, "time");
  assert.equal((await call("recordSiteExit", c, left(shift, Date.now() + 10 * MIN))).dropped, "time");
  const out = await punch(c, "out", { punchMs: Date.now() - 10 * MIN });
  const r = await call("recordSiteExit", c, left(shift, Date.now() - 5 * MIN));
  assert.equal(r.dropped, "afterShift");
  assert.equal(r.tracking, false);
  assert.ok(out.eventId);
});

test("an exit that syncs after the clock-out is saved already ended at the clock-out", async () => {
  const c = "se-late";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 60 * MIN })).eventId;
  const outMs = Date.now() - 20 * MIN;
  await punch(c, "out", { punchMs: outMs });
  const input = left(shift, Date.now() - 30 * MIN);
  const r = await call("recordSiteExit", c, input);
  assert.equal(r.recorded, true);
  assert.equal(r.tracking, false);
  const doc = await exitDoc(c, input.exitId);
  assert.equal(doc.endMs, outMs);
  assert.equal(doc.endReason, "clockOut");
  // Its real return, earlier than the clock-out, still corrects it.
  const backMs = Date.now() - 25 * MIN;
  assert.equal((await call("recordSiteExit", c, { ...input, phase: "end", atMs: backMs, location: fix(SITE, backMs) })).recorded, true);
  assert.equal((await exitDoc(c, input.exitId)).endReason, "returned");
});

test("any clock-out (incl. auto clock-out) ends the open stretches at the clock-out time, via the trigger", async () => {
  const c = "se-close";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 60 * MIN })).eventId;
  const a = left(shift, Date.now() - 40 * MIN);
  await call("recordSiteExit", c, a);
  const off = { exitId: randomUUID(), clockInEventId: shift, kind: "trackingOff", phase: "start", atMs: Date.now() - 30 * MIN, offReason: "signedOut" };
  await call("recordSiteExit", c, off);
  const outMs = Date.now() - 10 * MIN;
  const autoId = `auto-${shift}`;
  await db.doc(`companies/${c}/clockEvents/${autoId}`).set({
    employeeId: "emp1",
    employeeName: "Ana",
    type: "out",
    source: "autoClockOut",
    siteId: "site1",
    siteName: "Riverside",
    timestamp: admin.firestore.Timestamp.fromMillis(outMs),
  });
  await trigger(c, autoId);
  for (const id of [a.exitId, off.exitId]) {
    const doc = await exitDoc(c, id);
    assert.equal(doc.endMs, outMs);
    assert.equal(doc.endReason, "autoClockOut");
  }
  // The clock event itself is untouched by this.
  assert.equal((await event(c, autoId)).source, "autoClockOut");
});

test("closeOpenSiteExits leaves stretches that started after the clock-out alone", async () => {
  const c = "se-close-later";
  await db.doc(`companies/${c}/siteExits/x1`).set({ employeeId: "emp1", startMs: 100, endMs: null });
  await db.doc(`companies/${c}/siteExits/x2`).set({ employeeId: "emp1", startMs: 500, endMs: null });
  assert.equal(await siteExits.closeOpenSiteExits(c, "emp1", 300, "clockOut"), 1);
  assert.equal((await exitDoc(c, "x1")).endMs, 300);
  assert.equal((await exitDoc(c, "x2")).endMs, null);
});

test("per-shift cap stops a flapping phone", async () => {
  const c = "se-cap";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 60 * MIN })).eventId;
  const { MAX_SITE_EXITS_PER_SHIFT } = require("../lib/siteExitTypes.js");
  const batch = db.batch();
  for (let i = 0; i < MAX_SITE_EXITS_PER_SHIFT; i++) {
    batch.set(db.doc(`companies/${c}/siteExits/cap${i}`), { employeeId: "emp1", clockInEventId: shift, startMs: i, endMs: i + 1 });
  }
  await batch.commit();
  assert.equal((await call("recordSiteExit", c, left(shift, Date.now() - 5 * MIN))).dropped, "cap");
});

test("wrong account: another employee's clock-in is not this shift; unlinked login is refused", async () => {
  const c = "se-account";
  await seed(c);
  const shift = (await punch(c, "in", { punchMs: Date.now() - 20 * MIN })).eventId;
  await db.doc(`companies/${c}/employees/emp2`).set({ name: "Ben", active: true, linkedUserId: "uid2" });
  const ben = { uid: "uid2", token: { role: "employee", companyId: c, employeeId: "emp2" } };
  const r = await funcs.recordSiteExit.run({ data: left(shift, Date.now() - 5 * MIN), auth: ben, rawRequest: {} });
  assert.equal(r.dropped, "noShift");
  await db.doc(`companies/${c}/employees/emp1`).update({ linkedUserId: "other" });
  await assert.rejects(call("recordSiteExit", c, left(shift, Date.now() - 5 * MIN)), /no longer linked/);
  const admin1 = { uid: "a", token: { role: "admin", companyId: c } };
  await assert.rejects(funcs.recordSiteExit.run({ data: left(shift, Date.now()), auth: admin1, rawRequest: {} }), /Only an employee app login/);
});

// ---- 90-day location cleanup ----

test("cleanup clears places older than 90 days, keeps the times", async () => {
  const c = "se-cleanup";
  const DAY = 24 * 60 * MIN;
  const now = Date.now();
  const oldAt = admin.firestore.Timestamp.fromMillis(now - 91 * DAY);
  const newAt = admin.firestore.Timestamp.fromMillis(now - 10 * DAY);
  await db.doc(`companies/${c}`).set({ name: "x" });
  const base = { employeeId: "emp1", startMs: 1, endMs: 2, startLocation: AWAY, endLocation: SITE, startAccuracyM: 5, endAccuracyM: 6, hasLocation: true };
  await db.doc(`companies/${c}/siteExits/old`).set({ ...base, createdAt: oldAt });
  await db.doc(`companies/${c}/siteExits/new`).set({ ...base, createdAt: newAt });
  assert.ok((await siteExits.cleanupSiteExitLocationsRun(now)) >= 1);
  const old = await exitDoc(c, "old");
  assert.equal(old.startLocation, null);
  assert.equal(old.endLocation, null);
  assert.equal(old.startAccuracyM, null);
  assert.equal(old.hasLocation, false);
  assert.ok(old.locationRemovedAt);
  assert.equal(old.startMs, 1);
  assert.equal(old.endMs, 2);
  assert.deepEqual((await exitDoc(c, "new")).startLocation, AWAY);
});

// ---- location consent ----

test("location consent: not accepted until the current versions are sent; old versions refused", async () => {
  const c = "se-consent-call";
  await seed(c, { consent: false });
  const info = await call("getLocationConsent", c, {});
  assert.equal(info.accepted, false);
  assert.equal(info.locationConsentVersion, LOCATION_CONSENT_VERSION);
  assert.equal(info.privacyVersion, PRIVACY_POLICY_VERSION);
  assert.ok(info.locationConsentText.length > 50);
  await assert.rejects(call("acceptLocationConsent", c, { locationConsentVersion: "old", privacyVersion: PRIVACY_POLICY_VERSION }), /updated/);
  await call("acceptLocationConsent", c, { locationConsentVersion: LOCATION_CONSENT_VERSION, privacyVersion: PRIVACY_POLICY_VERSION });
  assert.equal((await call("getLocationConsent", c, {})).accepted, true);
  const doc = (await db.doc(`companies/${c}/employeeConsents/emp1`).get()).data();
  assert.equal(doc.locationConsentVersion, LOCATION_CONSENT_VERSION);
  assert.ok(doc.locationConsentAt);
});

// ---- the hard rule ----

test("never blocks: a broken site doc or failed fence read still records the punch", async () => {
  const c = "se-never-block";
  await seed(c);
  await db.doc(`companies/${c}/jobSites/site1`).set({ name: "Riverside", active: true, requireGeofence: true, lat: "bad", lng: null, radiusMeters: -5 });
  const res = await punch(c, "in");
  assert.equal(res.status, "in");
  assert.equal(res.fence, null);
  assert.equal((await event(c, res.eventId)).geofenceRadiusM, undefined);
  assert.equal((await punch(c, "out")).status, "out");
});
