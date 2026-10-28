// Employee App Phase 3 Step 4 - employeeClockPunch (functions/src/
// employeeClock.ts) and syncEmployeeSelfView (functions/src/
// employeeSelfView.ts). Runs the REAL compiled functions (lib/) against the
// Firestore emulator. Storage is an in-memory fake (photo files, metadata,
// deletes) and AWS Rekognition is stubbed, same as rekognition.test.js - no
// test reaches Storage, AWS or the network. Each test uses its own company.
//
// Run: firebase emulators:exec --only firestore "node --test test/employeeClock.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-employeeclock-test";
// Port must match firebase.json's emulators.firestore.port.
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

let awsCalls = 0;
RekognitionClient.prototype.send = async function () {
  awsCalls++;
  return { FaceMatches: [{ Similarity: 98.1 }], UnmatchedFaces: [] };
};

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

// ---- in-memory Storage fake ----
const files = new Map();
const deleted = [];
function notFound() {
  const e = new Error("No such object");
  e.code = 404;
  return e;
}
admin.storage().bucket = () => ({
  name: "test-bucket",
  file: (p) => ({
    getMetadata: async () => {
      if (!files.has(p)) throw notFound();
      return [files.get(p)];
    },
    setMetadata: async (m) => {
      const f = files.get(p);
      f.metadata = { ...(f.metadata || {}), ...(m.metadata || {}) };
      return [f];
    },
    delete: async () => {
      if (!files.has(p)) throw notFound();
      files.delete(p);
      deleted.push(p);
    },
    download: async () => [Buffer.from("fake-image-bytes")],
  }),
});

function addPhoto(p, { ageMs = 0, contentType = "image/jpeg", size = 2000 } = {}) {
  files.set(p, {
    contentType,
    size: String(size),
    timeCreated: new Date(Date.now() - ageMs).toISOString(),
    metadata: { firebaseStorageDownloadTokens: "tok-" + p.length },
  });
}

const REFERENCE_PHOTO_URL =
  "https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/companies%2Ftest%2Femployees%2Femp1%2Freference.jpg?alt=media&token=ref";
const PIN = "1234";

// Company with 3 sites and one linked, active employee (emp1, PIN 1234,
// assigned to site1, with a reference selfie).
async function seed(c, { plan = "pro_tier1", employee = {} } = {}) {
  const co = db.collection("companies").doc(c);
  await co.set({ name: "Co " + c, planTier: plan });
  await co.collection("jobSites").doc("site1").set({ name: "Site One", active: true });
  await co.collection("jobSites").doc("site2").set({ name: "Site Two", active: true });
  await co.collection("jobSites").doc("siteOff").set({ name: "Closed Site", active: false });
  await co.collection("employees").doc("emp1").set({
    name: "Ana",
    active: true,
    pin: PIN,
    hourlyRate: 25,
    dob: "1990-01-01",
    email: "ana@example.com",
    linkedUserId: "uid1",
    assignedSiteIds: ["site1"],
    photoUrl: REFERENCE_PHOTO_URL,
    subcontractorId: null,
    subcontractorName: null,
    ...employee,
  });
}

const employeeAuth = (c, token = {}) => ({ uid: "uid1", token: { role: "employee", companyId: c, employeeId: "emp1", ...token } });

function callPunch(c, data, auth = employeeAuth(c)) {
  return funcs.employeeClockPunch.run({ data, auth, rawRequest: {} });
}

// in/out need a PIN and a fresh photo at the punch's own path.
async function punch(c, action, { pin = PIN, photo = true, requestId = randomUUID(), auth, extra = {} } = {}) {
  const isInOut = action === "in" || action === "out";
  const data = { action, requestId, ...extra };
  if (isInOut) {
    data.pin = pin;
    data.photoPath = `companies/${c}/clockEvents/emp1/${requestId}.jpg`;
    if (photo) addPhoto(data.photoPath);
  }
  return callPunch(c, data, auth);
}

function reasonIs(reason) {
  return (err) => {
    assert.equal(err.details?.reason, reason, `expected ${reason}, got ${err.details?.reason}: ${err.message}`);
    return true;
  };
}

async function events(c) {
  const snap = await db.collection("companies").doc(c).collection("clockEvents").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Runs onClockEventCreated for one written event, like the real trigger.
async function runTrigger(c, eventId) {
  const ref = db.collection("companies").doc(c).collection("clockEvents").doc(eventId);
  const data = (await ref.get()).data();
  awsCalls = 0;
  await funcs.onClockEventCreated.run({ params: { companyId: c, eventId }, data: { data: () => data, ref } });
  return (await ref.get()).data();
}

// ===================== PIN =====================

test("wrong PIN is rejected, no event written, tries left in the message", async () => {
  const c = "ec-wrongpin";
  await seed(c);
  await assert.rejects(punch(c, "in", { pin: "9999" }), (err) => {
    reasonIs("wrongPin")(err);
    assert.equal(err.details.attemptsLeft, 2);
    assert.match(err.message, /Wrong PIN\. 2 tries left/);
    return true;
  });
  assert.equal((await events(c)).length, 0);
});

test("3 wrong PINs lock for 1 minute (server-side), then unlock (fake clock)", async (t) => {
  const c = "ec-lock";
  await seed(c);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-21T15:00:00Z") });
  await assert.rejects(punch(c, "in", { pin: "0000" }), reasonIs("wrongPin"));
  await assert.rejects(punch(c, "in", { pin: "0000" }), reasonIs("wrongPin"));
  await assert.rejects(punch(c, "in", { pin: "0000" }), (err) => {
    reasonIs("locked")(err);
    assert.equal(err.details.secondsLeft, 60);
    assert.match(err.message, /Try again in 60 seconds/);
    return true;
  });
  // Even the right PIN is refused while locked - a fresh request (as after
  // killing/reopening the app) gets the same server lock.
  t.mock.timers.tick(20 * 1000);
  await assert.rejects(punch(c, "in"), (err) => {
    reasonIs("locked")(err);
    assert.equal(err.details.secondsLeft, 40);
    return true;
  });
  const lock = (await db.doc(`companies/${c}/employeePinLocks/emp1`).get()).data();
  assert.ok(lock.lockedUntil);
  t.mock.timers.tick(41 * 1000);
  const ok = await punch(c, "in");
  assert.equal(ok.status, "in");
  assert.equal((await db.doc(`companies/${c}/employeePinLocks/emp1`).get()).exists, false);
  assert.equal((await events(c)).length, 1);
});

test("a right PIN clears an earlier wrong count", async () => {
  const c = "ec-pinreset";
  await seed(c);
  await assert.rejects(punch(c, "in", { pin: "0000" }), reasonIs("wrongPin"));
  await assert.rejects(punch(c, "in", { pin: "0000" }), reasonIs("wrongPin"));
  await punch(c, "in");
  await assert.rejects(punch(c, "out", { pin: "0000" }), (err) => {
    reasonIs("wrongPin")(err);
    assert.equal(err.details.attemptsLeft, 2);
    return true;
  });
});

test("the PIN is never in the result", async () => {
  const c = "ec-nopin";
  await seed(c);
  const res = await punch(c, "in");
  assert.ok(!JSON.stringify(res).includes(PIN));
  assert.equal(res.pin, undefined);
});

// ===================== PIN check before the camera =====================

function checkPin(c, action, { pin = PIN, requestId = randomUUID(), auth, extra = {} } = {}) {
  return callPunch(c, { action, requestId, pin, checkPinOnly: true, ...extra }, auth);
}

test("PIN check: right PIN -> pinOk, nothing written, no photo needed", async () => {
  const c = "ec-check-ok";
  await seed(c);
  const before = files.size;
  assert.deepEqual(await checkPin(c, "in"), { pinOk: true });
  assert.deepEqual(await checkPin(c, "out"), { pinOk: true });
  assert.equal((await events(c)).length, 0);
  assert.equal((await db.doc(`companies/${c}/employeePinLocks/emp1`).get()).exists, false);
  const emp = (await db.doc(`companies/${c}/employees/emp1`).get()).data();
  assert.equal(emp.lastPunchRequestId, undefined);
  assert.equal(files.size, before);
});

test("PIN check: wrong PIN gives tries left; 3 wrong locks (same server lock as the punch)", async (t) => {
  const c = "ec-check-lock";
  await seed(c);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-21T15:00:00Z") });
  await assert.rejects(checkPin(c, "in", { pin: "0000" }), (err) => {
    reasonIs("wrongPin")(err);
    assert.equal(err.details.attemptsLeft, 2);
    assert.match(err.message, /Wrong PIN\. 2 tries left/);
    return true;
  });
  await assert.rejects(checkPin(c, "in", { pin: "0000" }), reasonIs("wrongPin"));
  await assert.rejects(checkPin(c, "in", { pin: "0000" }), (err) => {
    reasonIs("locked")(err);
    assert.equal(err.details.secondsLeft, 60);
    return true;
  });
  // Locked: the right PIN is refused by the check AND by a real punch.
  t.mock.timers.tick(10 * 1000);
  await assert.rejects(checkPin(c, "in"), (err) => reasonIs("locked")(err) && err.details.secondsLeft === 50);
  await assert.rejects(punch(c, "in"), reasonIs("locked"));
  assert.equal((await events(c)).length, 0);
  t.mock.timers.tick(51 * 1000);
  assert.deepEqual(await checkPin(c, "in"), { pinOk: true });
  assert.equal((await db.doc(`companies/${c}/employeePinLocks/emp1`).get()).exists, false);
});

test("PIN check and punch share one wrong-PIN count", async () => {
  const c = "ec-check-shared";
  await seed(c);
  await assert.rejects(checkPin(c, "in", { pin: "0000" }), reasonIs("wrongPin"));
  await assert.rejects(punch(c, "in", { pin: "0000" }), (err) => reasonIs("wrongPin")(err) && err.details.attemptsLeft === 1);
  await assert.rejects(checkPin(c, "in", { pin: "0000" }), reasonIs("locked"));
});

test("PIN check can't be skipped: a punch without it still checks the PIN", async () => {
  const c = "ec-check-skip";
  await seed(c);
  const requestId = randomUUID();
  await assert.rejects(punch(c, "in", { pin: "0000", requestId }), reasonIs("wrongPin"));
  assert.ok(deleted.includes(`companies/${c}/clockEvents/emp1/${requestId}.jpg`));
  assert.equal((await events(c)).length, 0);
  // A passed check doesn't let a later punch through with a wrong PIN.
  const id2 = randomUUID();
  assert.deepEqual(await checkPin(c, "in", { requestId: id2 }), { pinOk: true });
  await assert.rejects(punch(c, "in", { pin: "0000", requestId: id2 }), reasonIs("wrongPin"));
  assert.equal((await events(c)).length, 0);
  // The same requestId then punches normally with the right PIN.
  const ok = await punch(c, "in", { requestId: id2 });
  assert.equal(ok.status, "in");
});

test("PIN check: inactive, unlinked and other-account logins are rejected", async () => {
  const c = "ec-check-account";
  await seed(c, { employee: { active: false } });
  await assert.rejects(checkPin(c, "in"), reasonIs("inactive"));
  await seed("ec-check-unlinked", { employee: { linkedUserId: "someoneElse" } });
  await assert.rejects(checkPin("ec-check-unlinked", "in"), reasonIs("wrongAccount"));
  await seed("ec-check-other");
  await assert.rejects(checkPin("ec-check-other", "in", { extra: { employeeId: "empB" } }), reasonIs("wrongAccount"));
  await assert.rejects(callPunch("ec-check-other", { action: "in", requestId: randomUUID(), pin: PIN, checkPinOnly: true }, null), reasonIs("notSignedIn"));
  // A wrong PIN on an inactive account is still "inactive" (never a PIN hint).
  await assert.rejects(checkPin(c, "in", { pin: "0000" }), reasonIs("inactive"));
  assert.equal((await db.doc(`companies/${c}/employeePinLocks/emp1`).get()).exists, false);
});

test("PIN check: bad input (break, no PIN, a photo, checkPinOnly not true)", async () => {
  const c = "ec-check-input";
  await seed(c);
  const id = randomUUID();
  await assert.rejects(callPunch(c, { action: "breakStart", requestId: id, checkPinOnly: true }), reasonIs("invalid"));
  await assert.rejects(callPunch(c, { action: "breakStart", requestId: id, pin: PIN, checkPinOnly: true }), reasonIs("invalid"));
  await assert.rejects(callPunch(c, { action: "in", requestId: id, checkPinOnly: true }), reasonIs("invalid"));
  await assert.rejects(
    callPunch(c, { action: "in", requestId: id, pin: PIN, checkPinOnly: true, photoPath: `companies/${c}/clockEvents/emp1/${id}.jpg` }),
    reasonIs("invalid")
  );
  await assert.rejects(callPunch(c, { action: "in", requestId: id, pin: PIN, checkPinOnly: false }), reasonIs("invalid"));
  // Without the flag a photo is still required.
  await assert.rejects(callPunch(c, { action: "in", requestId: id, pin: PIN }), reasonIs("invalid"));
  assert.equal((await events(c)).length, 0);
});

test("PIN check after the punch was written: no replay result, just the check", async () => {
  const c = "ec-check-after";
  await seed(c);
  const requestId = randomUUID();
  await punch(c, "in", { requestId });
  assert.deepEqual(await checkPin(c, "in", { requestId }), { pinOk: true });
  assert.equal((await events(c)).length, 1);
});

test("PIN check never returns the PIN", async () => {
  const c = "ec-check-nopin";
  await seed(c);
  assert.ok(!JSON.stringify(await checkPin(c, "in")).includes(PIN));
  await assert.rejects(checkPin(c, "in", { pin: "0000" }), (err) => !JSON.stringify({ m: err.message, d: err.details }).includes(PIN));
});

// ===================== account =====================

test("inactive employee is rejected with the inactive message, photo deleted", async () => {
  const c = "ec-inactive";
  await seed(c, { employee: { active: false } });
  const requestId = randomUUID();
  await assert.rejects(punch(c, "in", { requestId }), (err) => {
    reasonIs("inactive")(err);
    assert.equal(err.message, "Your account is inactive, speak to your admin");
    return true;
  });
  await assert.rejects(punch(c, "breakStart"), reasonIs("inactive"));
  assert.ok(deleted.includes(`companies/${c}/clockEvents/emp1/${requestId}.jpg`));
  assert.equal((await events(c)).length, 0);
});

test("punch for another employee is rejected", async () => {
  const c = "ec-otheremp";
  await seed(c);
  await assert.rejects(punch(c, "in", { extra: { employeeId: "empB" } }), reasonIs("wrongAccount"));
  assert.equal((await events(c)).length, 0);
});

test("punch for another company is rejected", async () => {
  const c = "ec-otherco";
  await seed(c);
  await seed("ec-otherco-B");
  await assert.rejects(punch(c, "in", { extra: { companyId: "ec-otherco-B" } }), reasonIs("wrongAccount"));
  assert.equal((await events(c)).length, 0);
  assert.equal((await events("ec-otherco-B")).length, 0);
});

test("unlinked login, non-employee role, and signed-out calls are rejected", async () => {
  const c = "ec-unlinked";
  await seed(c, { employee: { linkedUserId: "someoneElse" } });
  await assert.rejects(punch(c, "in"), reasonIs("wrongAccount"));
  await seed("ec-role");
  await assert.rejects(punch("ec-role", "in", { auth: employeeAuth("ec-role", { role: "supervisor" }) }), reasonIs("wrongAccount"));
  await assert.rejects(callPunch("ec-role", { action: "breakStart", requestId: randomUUID() }, null), reasonIs("notSignedIn"));
  assert.equal((await events("ec-role")).length, 0);
});

// ===================== state + double taps =====================

test("wrong-state punches are rejected with a plain message", async () => {
  const c = "ec-states";
  await seed(c);
  await assert.rejects(punch(c, "out"), (e) => reasonIs("wrongState")(e) && /not clocked in/.test(e.message));
  await assert.rejects(punch(c, "breakStart"), (e) => reasonIs("wrongState")(e) && /Clock in before/.test(e.message));
  await assert.rejects(punch(c, "breakEnd"), reasonIs("wrongState"));
  await punch(c, "in");
  await assert.rejects(punch(c, "in"), (e) => reasonIs("wrongState")(e) && /already clocked in/.test(e.message));
  await assert.rejects(punch(c, "breakEnd"), (e) => reasonIs("wrongState")(e) && /not on a break/.test(e.message));
  await punch(c, "breakStart");
  await assert.rejects(punch(c, "breakStart"), (e) => reasonIs("wrongState")(e) && /already on a break/.test(e.message));
  await assert.rejects(punch(c, "out"), (e) => reasonIs("wrongState")(e) && /End your break/.test(e.message));
  await assert.rejects(punch(c, "in"), reasonIs("wrongState"));
  await punch(c, "breakEnd");
  await punch(c, "out");
  const types = (await events(c)).map((e) => e.type).sort();
  assert.deepEqual(types, ["breakEnd", "breakStart", "in", "out"]);
});

test("duplicate tap (same requestId) returns the first result, no second event", async () => {
  const c = "ec-dup";
  await seed(c);
  const requestId = randomUUID();
  const first = await punch(c, "in", { requestId });
  const again = await punch(c, "in", { requestId });
  assert.equal(first.replayed, false);
  assert.equal(again.replayed, true);
  assert.equal(again.eventId, first.eventId);
  assert.equal(again.timestampMs, first.timestampMs);
  assert.equal((await events(c)).length, 1);
  // The replay never deletes the first punch's photo.
  assert.ok(!deleted.includes(`companies/${c}/clockEvents/emp1/${requestId}.jpg`));
});

test("double tap with two requestIds at once: exactly one event", async () => {
  const c = "ec-race";
  await seed(c);
  const results = await Promise.allSettled([punch(c, "in"), punch(c, "in"), punch(c, "in")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results.filter((x) => x.status === "rejected")) reasonIs("wrongState")(r.reason);
  assert.equal((await events(c)).length, 1);
});

test("a requestId used for another action is rejected", async () => {
  const c = "ec-reuse";
  await seed(c);
  const requestId = randomUUID();
  await punch(c, "in", { requestId });
  await assert.rejects(punch(c, "breakStart", { requestId }), reasonIs("invalid"));
  assert.equal((await events(c)).length, 1);
});

// ===================== event fields =====================

test("uses server time, source employeeApp, and ignores a client timestamp", async () => {
  const c = "ec-time";
  await seed(c, { employee: { subcontractorId: "sub1", subcontractorName: "Sub Co" } });
  const before = Date.now();
  const res = await punch(c, "in", { extra: { timestamp: 0, source: "pin" } }).catch((e) => e);
  // Unknown keys are dropped by the schema, not trusted.
  assert.equal(res.status, "in");
  const after = Date.now();
  const [ev] = await events(c);
  assert.equal(ev.source, "employeeApp");
  assert.equal(ev.createdByUid, "uid1");
  assert.equal(ev.requestId, ev.id);
  assert.equal(ev.subcontractorId, "sub1");
  assert.ok(ev.timestamp.toMillis() >= before && ev.timestamp.toMillis() <= after);
  assert.equal(res.timestampMs, ev.timestamp.toMillis());
});

test("in/out event links the photo; breaks need no PIN or photo", async () => {
  const c = "ec-photo-link";
  await seed(c);
  const requestId = randomUUID();
  await punch(c, "in", { requestId });
  const bs = await punch(c, "breakStart");
  assert.equal(bs.status, "break");
  assert.equal(bs.photoUrl, null);
  const all = await events(c);
  const inEv = all.find((e) => e.type === "in");
  assert.ok(inEv.photoUrl.includes(encodeURIComponent(`companies/${c}/clockEvents/emp1/${requestId}.jpg`)));
  assert.ok(inEv.photoUrl.includes("token="));
  assert.equal(all.find((e) => e.type === "breakStart").photoUrl, undefined);
});

test("bad input: PIN on a break, missing PIN or photo on in/out, bad requestId", async () => {
  const c = "ec-input";
  await seed(c);
  await assert.rejects(callPunch(c, { action: "breakStart", requestId: randomUUID(), pin: PIN }), reasonIs("invalid"));
  await assert.rejects(callPunch(c, { action: "in", requestId: randomUUID(), photoPath: "x" }), reasonIs("invalid"));
  await assert.rejects(callPunch(c, { action: "in", requestId: "not-a-uuid", pin: PIN }), reasonIs("invalid"));
  await assert.rejects(callPunch(c, { action: "teleport", requestId: randomUUID() }), reasonIs("invalid"));
  assert.equal((await events(c)).length, 0);
});

// ===================== photo =====================

test("missing photo file is rejected", async () => {
  const c = "ec-nophoto";
  await seed(c);
  await assert.rejects(punch(c, "in", { photo: false }), reasonIs("photo"));
  assert.equal((await events(c)).length, 0);
});

test("photo from another folder is rejected and that file is NOT deleted", async () => {
  const c = "ec-otherphoto";
  await seed(c);
  const other = `companies/${c}/clockEvents/empB/x.jpg`;
  addPhoto(other);
  await assert.rejects(
    callPunch(c, { action: "in", requestId: randomUUID(), pin: PIN, photoPath: other }),
    reasonIs("photo")
  );
  assert.ok(files.has(other));
  assert.equal((await events(c)).length, 0);
});

test("stale or non-image photo is rejected and deleted", async () => {
  const c = "ec-stalephoto";
  await seed(c);
  const rid = randomUUID();
  const p = `companies/${c}/clockEvents/emp1/${rid}.jpg`;
  addPhoto(p, { ageMs: 11 * 60 * 1000 });
  await assert.rejects(callPunch(c, { action: "in", requestId: rid, pin: PIN, photoPath: p }), reasonIs("photo"));
  assert.ok(deleted.includes(p));
  const rid2 = randomUUID();
  const p2 = `companies/${c}/clockEvents/emp1/${rid2}.jpg`;
  addPhoto(p2, { contentType: "text/plain" });
  await assert.rejects(callPunch(c, { action: "in", requestId: rid2, pin: PIN, photoPath: p2 }), reasonIs("photo"));
  assert.ok(deleted.includes(p2));
});

test("a rejected punch deletes its own photo (wrong PIN, wrong state)", async () => {
  const c = "ec-cleanup";
  await seed(c);
  const r1 = randomUUID();
  await assert.rejects(punch(c, "in", { pin: "0000", requestId: r1 }), reasonIs("wrongPin"));
  assert.ok(deleted.includes(`companies/${c}/clockEvents/emp1/${r1}.jpg`));
  const r2 = randomUUID();
  await assert.rejects(punch(c, "out", { requestId: r2 }), reasonIs("wrongState"));
  assert.ok(deleted.includes(`companies/${c}/clockEvents/emp1/${r2}.jpg`));
});

// ===================== site =====================

test("site: crew code site (newest token of the code) when still active", async () => {
  const c = "ec-site-code";
  await seed(c, { employee: { joinCodeId: "code-1", assignedSiteIds: ["site1"] } });
  await db.collection("joinCodes").doc("tokOld" + c).set({ codeId: "code-1", companyId: c, siteId: "site1", createdAt: admin.firestore.Timestamp.fromMillis(1000) });
  await db.collection("joinCodes").doc("tokNew" + c).set({ codeId: "code-1", companyId: c, siteId: "site2", createdAt: admin.firestore.Timestamp.fromMillis(2000) });
  const res = await punch(c, "in");
  assert.equal(res.siteId, "site2");
  assert.equal(res.siteName, "Site Two");
  const [ev] = await events(c);
  assert.equal(ev.siteId, "site2");
  assert.equal(ev.siteName, "Site Two");
});

test("site: crew code site inactive -> the one assigned site", async () => {
  const c = "ec-site-assigned";
  await seed(c, { employee: { joinCodeId: "code-2", assignedSiteIds: ["site1"] } });
  await db.collection("joinCodes").doc("tok" + c).set({ codeId: "code-2", companyId: c, siteId: "siteOff", createdAt: admin.firestore.Timestamp.fromMillis(1000) });
  const res = await punch(c, "in");
  assert.equal(res.siteId, "site1");
  assert.equal(res.siteName, "Site One");
});

test("site: no crew code and several (or zero) assigned sites -> none", async () => {
  const c = "ec-site-none";
  await seed(c, { employee: { assignedSiteIds: ["site1", "site2"] } });
  const res = await punch(c, "in");
  assert.equal(res.siteId, null);
  assert.equal(res.siteName, null);
  const [ev] = await events(c);
  assert.equal(ev.siteId, null);
  assert.equal(ev.siteName, "Not specified");

  const c2 = "ec-site-zero";
  await seed(c2, { employee: { assignedSiteIds: [] } });
  assert.equal((await punch(c2, "in")).siteId, null);
});

test("site: crew site deactivated mid-shift -> breaks and clock out keep the clock-in site", async () => {
  const c = "ec-site-midshift";
  await seed(c, { employee: { joinCodeId: "code-3", assignedSiteIds: ["site1"] } });
  await db.collection("joinCodes").doc("tok" + c).set({ codeId: "code-3", companyId: c, siteId: "site2", createdAt: admin.firestore.Timestamp.fromMillis(1000) });
  const inRes = await punch(c, "in");
  assert.equal(inRes.siteId, "site2");
  await db.doc(`companies/${c}/jobSites/site2`).update({ active: false });
  const bs = await punch(c, "breakStart");
  const be = await punch(c, "breakEnd");
  const out = await punch(c, "out");
  for (const r of [bs, be, out]) {
    assert.equal(r.siteId, "site2");
    assert.equal(r.siteName, "Site Two");
  }
  const byType = Object.fromEntries((await events(c)).map((e) => [e.type, e]));
  for (const t of ["breakStart", "breakEnd", "out"]) assert.equal(byType[t].siteId, "site2", t);
});

test("site: assigned sites changed mid-shift -> clock out keeps the clock-in site; no-site shift stays no-site", async () => {
  const c = "ec-site-reassign";
  await seed(c, { employee: { assignedSiteIds: ["site1"] } });
  await punch(c, "in");
  await db.doc(`companies/${c}/employees/emp1`).update({ assignedSiteIds: ["site2"] });
  assert.equal((await punch(c, "out")).siteId, "site1");

  const c2 = "ec-site-none-shift";
  await seed(c2, { employee: { assignedSiteIds: [] } });
  await punch(c2, "in");
  await db.doc(`companies/${c2}/employees/emp1`).update({ assignedSiteIds: ["site1"] });
  const out = await punch(c2, "out");
  assert.equal(out.siteId, null);
  const ev = (await events(c2)).find((e) => e.type === "out");
  assert.equal(ev.siteName, "Not specified");
});

// ===================== getEmployeeHomeSite =====================

const homeSite = (c, auth = employeeAuth(c)) => funcs.getEmployeeHomeSite.run({ data: {}, auth, rawRequest: {} });

test("home site: same rule as clock-in (crew code site, else single assigned, else none)", async () => {
  const c = "ec-home-code";
  await seed(c, { employee: { joinCodeId: "code-h", assignedSiteIds: ["site1"] } });
  await db.collection("joinCodes").doc("tok" + c).set({ codeId: "code-h", companyId: c, siteId: "site2", createdAt: admin.firestore.Timestamp.fromMillis(1000) });
  assert.deepEqual(await homeSite(c), { siteId: "site2", siteName: "Site Two" });
  await db.doc(`companies/${c}/jobSites/site2`).update({ active: false });
  assert.deepEqual(await homeSite(c), { siteId: "site1", siteName: "Site One" });
  await db.doc(`companies/${c}/employees/emp1`).update({ assignedSiteIds: ["site1", "site2"] });
  assert.deepEqual(await homeSite(c), { siteId: null, siteName: null });
});

test("home site: matches what the next clock-in gets", async () => {
  const c = "ec-home-match";
  await seed(c, { employee: { joinCodeId: "code-m" } });
  await db.collection("joinCodes").doc("tok" + c).set({ codeId: "code-m", companyId: c, siteId: "site2", createdAt: admin.firestore.Timestamp.fromMillis(1000) });
  const site = await homeSite(c);
  const res = await punch(c, "in");
  assert.equal(res.siteId, site.siteId);
  assert.equal(res.siteName, site.siteName);
});

test("home site: rejects signed out, non-employee role and unlinked login", async () => {
  const c = "ec-home-auth";
  await seed(c, { employee: { linkedUserId: "someoneElse" } });
  await assert.rejects(homeSite(c), reasonIs("wrongAccount"));
  await assert.rejects(homeSite(c, employeeAuth(c, { role: "supervisor" })), reasonIs("wrongAccount"));
  await assert.rejects(homeSite(c, null), reasonIs("notSignedIn"));
});

// ===================== face check (through the real trigger) =====================

test("Pro + selfie: the employeeApp punch gets the face check", async () => {
  const c = "ec-face-pro";
  await seed(c);
  const res = await punch(c, "in");
  const ev = await runTrigger(c, res.eventId);
  assert.equal(awsCalls, 1);
  assert.equal(ev.faceCheck.status, "match");
});

test("Core: no face check", async () => {
  const c = "ec-face-core";
  await seed(c, { plan: "core2_tier1" });
  const res = await punch(c, "in");
  const ev = await runTrigger(c, res.eventId);
  assert.equal(awsCalls, 0);
  assert.equal(ev.faceCheck, undefined);
});

test("Pro, no selfie: no face check", async () => {
  const c = "ec-face-noselfie";
  await seed(c);
  await db.doc(`companies/${c}/employees/emp1`).update({ photoUrl: admin.firestore.FieldValue.delete() });
  const res = await punch(c, "in");
  const ev = await runTrigger(c, res.eventId);
  assert.equal(awsCalls, 0);
  assert.equal(ev.faceCheck, undefined);
});

// ===================== self view =====================

function employeeWriteEvent(c, before, after) {
  return {
    params: { companyId: c, employeeId: "emp1" },
    data: {
      before: { exists: !!before, data: () => before },
      after: { exists: !!after, data: () => after },
    },
  };
}

test("self view: copies only safe fields - never the PIN, rate, dob or email", async () => {
  const c = "ec-view";
  await seed(c, { employee: { joinCodeId: "code-9", lastEventType: "in", lastEventSiteId: "site1", lastEventSiteName: "Site One" } });
  const emp = (await db.doc(`companies/${c}/employees/emp1`).get()).data();
  await funcs.syncEmployeeSelfView.run(employeeWriteEvent(c, undefined, emp));
  const view = (await db.doc(`companies/${c}/employeeSelfViews/emp1`).get()).data();
  for (const banned of ["pin", "hourlyRate", "dob", "email", "faceReference", "rateHistory"]) {
    assert.equal(view[banned], undefined, banned);
  }
  assert.ok(!JSON.stringify(view).includes(PIN));
  assert.equal(view.name, "Ana");
  assert.equal(view.active, true);
  assert.equal(view.linkedUserId, "uid1");
  assert.equal(view.joinCodeId, "code-9");
  assert.deepEqual(view.assignedSiteIds, ["site1"]);
  assert.equal(view.lastEventType, "in");
  assert.equal(view.photoUrl, REFERENCE_PHOTO_URL);
});

test("self view: updates on a real change, skips a PIN-only change, deleted with the employee", async () => {
  const c = "ec-view-sync";
  await seed(c);
  const emp = (await db.doc(`companies/${c}/employees/emp1`).get()).data();
  const viewRef = db.doc(`companies/${c}/employeeSelfViews/emp1`);
  await funcs.syncEmployeeSelfView.run(employeeWriteEvent(c, undefined, emp));

  await funcs.syncEmployeeSelfView.run(employeeWriteEvent(c, emp, { ...emp, active: false }));
  assert.equal((await viewRef.get()).data().active, false);

  // A PIN-only (or rate-only) change writes nothing to the view.
  await viewRef.update({ marker: "untouched" });
  await funcs.syncEmployeeSelfView.run(employeeWriteEvent(c, { ...emp, active: false }, { ...emp, active: false, pin: "9876", hourlyRate: 40 }));
  const v = (await viewRef.get()).data();
  assert.equal(v.marker, "untouched");
  assert.ok(!JSON.stringify(v).includes("9876"));

  await funcs.syncEmployeeSelfView.run(employeeWriteEvent(c, emp, undefined));
  assert.equal((await viewRef.get()).exists, false);
});
