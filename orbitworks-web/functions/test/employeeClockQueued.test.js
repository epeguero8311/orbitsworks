// Employee App Phase 4 - queued (offline) punches through employeeClockPunch
// (functions/src/employeeClock.ts + employeeClockQueued.ts), plus checks
// that ONLINE punches are unchanged. Same harness as employeeClock.test.js:
// the REAL compiled functions against the Firestore emulator, Storage an
// in-memory fake, AWS stubbed. Each test uses its own company.
//
// Run: firebase emulators:exec --only firestore "node --test test/employeeClockQueued.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-employeeclockqueued-test";
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

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

// A queued punch: same as punch() plus the phone's time.
function queuedPunch(c, action, queuedAtMs, opts = {}) {
  return punch(c, action, { ...opts, extra: { ...(opts.extra || {}), queuedAtMs } });
}

// An event written straight to Firestore (e.g. an auto clock-out).
async function addEvent(c, id, type, ms, source = "autoClockOut") {
  await db
    .collection("companies")
    .doc(c)
    .collection("clockEvents")
    .doc(id)
    .set({ employeeId: "emp1", employeeName: "Ana", type, source, timestamp: admin.firestore.Timestamp.fromMillis(ms), siteId: "site1", siteName: "Site One" });
}

async function alertsOf(c, type) {
  const snap = await db.collection("companies").doc(c).collection("alerts").where("alertType", "==", type).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const lockDoc = (c) => db.doc(`companies/${c}/employeePinLocks/emp1`);
const failDoc = (c) => db.doc(`companies/${c}/syncPinFailures/emp1`);
const COULDNT_SYNC = "Couldn't sync, please speak to your supervisor.";
const NOT_RECORDED = "Not recorded, tell your admin.";

// ===================== online punches are unchanged =====================

test("online: server time, no syncedLate, nothing queued-only written", async () => {
  const c = "q-online";
  await seed(c);
  const before = Date.now();
  const res = await punch(c, "in");
  const [ev] = await events(c);
  assert.equal(ev.syncedLate, undefined);
  assert.equal(ev.queued, undefined);
  assert.ok(ev.timestamp.toMillis() >= before && ev.timestamp.toMillis() <= Date.now());
  assert.equal(res.timestampMs, ev.timestamp.toMillis());
  assert.equal((await failDoc(c).get()).exists, false);
});

test("online: wrong PIN still uses the 3-strike lock and never the sync count", async () => {
  const c = "q-online-lock";
  await seed(c);
  await assert.rejects(punch(c, "in", { pin: "0000" }), (err) => {
    reasonIs("wrongPin")(err);
    assert.equal(err.details.attemptsLeft, 2);
    assert.equal(err.details.queued, undefined);
    return true;
  });
  await assert.rejects(punch(c, "in", { pin: "0000" }), reasonIs("wrongPin"));
  await assert.rejects(punch(c, "in", { pin: "0000" }), reasonIs("locked"));
  assert.equal((await failDoc(c).get()).exists, false);
});

test("online: PIN check, clock in, breaks and clock out are unchanged", async () => {
  const c = "q-online-flow";
  await seed(c);
  const rid = randomUUID();
  assert.equal((await callPunch(c, { action: "in", requestId: rid, pin: PIN, checkPinOnly: true })).pinOk, true);
  await punch(c, "in", { requestId: rid });
  await punch(c, "breakStart");
  await punch(c, "breakEnd");
  await punch(c, "out");
  const evs = await events(c);
  assert.equal(evs.length, 4);
  assert.ok(evs.every((e) => e.syncedLate === undefined && e.queued === undefined));
});

// ===================== queued: time =====================

test("queued: clock in, break, clock out land with the phone's times, queued and syncedLate", async () => {
  const c = "q-chain";
  await seed(c);
  const now = Date.now();
  const tIn = now - 3 * HOUR;
  const tBs = now - 2 * HOUR;
  const tBe = now - 90 * MIN;
  const tOut = now - 10 * MIN;
  const rIn = await queuedPunch(c, "in", tIn);
  await queuedPunch(c, "breakStart", tBs);
  await queuedPunch(c, "breakEnd", tBe);
  const rOut = await queuedPunch(c, "out", tOut);
  assert.equal(rIn.timestampMs, tIn);
  assert.equal(rOut.timestampMs, tOut);
  assert.equal(rOut.status, "out");
  const evs = (await events(c)).sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
  assert.deepEqual(
    evs.map((e) => [e.type, e.timestamp.toMillis(), e.queued, e.syncedLate]),
    [
      ["in", tIn, true, true],
      ["breakStart", tBs, true, true],
      ["breakEnd", tBe, true, true],
      ["out", tOut, true, true],
    ]
  );
  assert.equal(evs[0].source, "employeeApp");
  assert.equal(evs[0].siteId, "site1");
  assert.equal(evs[3].siteId, "site1");
});

test("queued: synced under 5 min after its time = queued but NOT synced late; 5 min or more = synced late", async (t) => {
  const c = "q-late5";
  await seed(c);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-30T15:00:00Z") });
  await queuedPunch(c, "in", Date.now() - 5 * MIN + 1000);
  await queuedPunch(c, "breakStart", Date.now() - MIN);
  await queuedPunch(c, "breakEnd", Date.now() - 5 * 1000);
  t.mock.timers.tick(5 * MIN);
  await queuedPunch(c, "out", Date.now() - 5 * MIN);
  const evs = (await events(c)).sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
  assert.deepEqual(
    evs.map((e) => [e.type, e.queued, e.syncedLate]),
    [
      ["in", true, undefined],
      ["breakStart", true, undefined],
      ["breakEnd", true, undefined],
      ["out", true, true],
    ]
  );
});

test("queued: up to 2 min in the future is accepted (kept at server now); more is badTime", async () => {
  const c = "q-future";
  await seed(c);
  const res = await queuedPunch(c, "in", Date.now() + 2 * MIN - 2000);
  assert.ok(res.timestampMs <= Date.now());
  const [first] = await events(c);
  assert.equal(first.queued, true);
  assert.equal(first.syncedLate, undefined);
  const rid = randomUUID();
  await assert.rejects(queuedPunch(c, "out", Date.now() + 2 * MIN + 5000, { requestId: rid }), (err) => {
    reasonIs("badTime")(err);
    assert.equal(err.message, COULDNT_SYNC);
    return true;
  });
  assert.equal((await events(c)).length, 1);
  assert.ok(deleted.includes(`companies/${c}/clockEvents/emp1/${rid}.jpg`));
});

test("queued: older than 24 h is tooOld (Not recorded), just under is fine", async () => {
  const c = "q-old";
  await seed(c);
  await assert.rejects(queuedPunch(c, "in", Date.now() - 24 * HOUR - MIN), (err) => {
    reasonIs("tooOld")(err);
    assert.equal(err.message, NOT_RECORDED);
    return true;
  });
  assert.equal((await events(c)).length, 0);
  assert.equal((await failDoc(c).get()).exists, false);
  const ok = await queuedPunch(c, "in", Date.now() - 24 * HOUR + MIN);
  assert.equal(ok.status, "in");
});

test("queued: a later punch already recorded (auto clock-out ran first) is superseded", async () => {
  const c = "q-superseded";
  await seed(c);
  const now = Date.now();
  await queuedPunch(c, "in", now - 13 * HOUR);
  await addEvent(c, "auto-out-1", "out", now - HOUR);
  const rid = randomUUID();
  await assert.rejects(queuedPunch(c, "out", now - 2 * HOUR, { requestId: rid }), (err) => {
    reasonIs("superseded")(err);
    assert.equal(err.message, NOT_RECORDED);
    return true;
  });
  await assert.rejects(queuedPunch(c, "breakEnd", now - 3 * HOUR), reasonIs("superseded"));
  assert.equal((await events(c)).length, 2);
  assert.ok(deleted.includes(`companies/${c}/clockEvents/emp1/${rid}.jpg`));
});

test("queued: wrong state still rejected (clock out while on break)", async () => {
  const c = "q-state";
  await seed(c);
  const now = Date.now();
  await queuedPunch(c, "in", now - 2 * HOUR);
  await queuedPunch(c, "breakStart", now - HOUR);
  await assert.rejects(queuedPunch(c, "out", now - 30 * MIN), reasonIs("wrongState"));
});

test("queued: resending a punch that already landed online returns the first result", async () => {
  const c = "q-replay";
  await seed(c);
  const rid = randomUUID();
  const first = await punch(c, "in", { requestId: rid });
  const again = await queuedPunch(c, "in", Date.now() - MIN, { requestId: rid });
  assert.equal(again.replayed, true);
  assert.equal(again.timestampMs, first.timestampMs);
  assert.equal((await events(c)).length, 1);
});

test("queued: bad input (time on a PIN check, not a whole number, negative)", async () => {
  const c = "q-input";
  await seed(c);
  await assert.rejects(
    callPunch(c, { action: "in", requestId: randomUUID(), pin: PIN, checkPinOnly: true, queuedAtMs: Date.now() }),
    reasonIs("invalid")
  );
  await assert.rejects(queuedPunch(c, "in", Date.now() - 1.5), reasonIs("invalid"));
  await assert.rejects(queuedPunch(c, "in", -5), reasonIs("invalid"));
});

// ===================== queued: PIN =====================

test("queued: wrong PIN never touches the 3-strike lock, and is marked queued", async () => {
  const c = "q-pin";
  await seed(c);
  for (let i = 0; i < 4; i++) {
    await assert.rejects(queuedPunch(c, "in", Date.now() - HOUR, { pin: "0000" }), (err) => {
      reasonIs("wrongPin")(err);
      assert.equal(err.details.queued, true);
      assert.equal(err.details.attemptsLeft, undefined);
      return true;
    });
  }
  assert.equal((await lockDoc(c).get()).exists, false);
  // The online count starts fresh: 2 tries left after one online wrong PIN.
  await assert.rejects(punch(c, "in", { pin: "0000" }), (err) => {
    assert.equal(err.details.attemptsLeft, 2);
    return true;
  });
  assert.equal((await events(c)).length, 0);
});

test("queued: right PIN goes through even while the online lock is on", async (t) => {
  const c = "q-pin-locked";
  await seed(c);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-29T15:00:00Z") });
  for (let i = 0; i < 3; i++) await assert.rejects(punch(c, "in", { pin: "0000" }));
  await assert.rejects(punch(c, "in"), reasonIs("locked"));
  const res = await queuedPunch(c, "in", Date.now() - 30 * MIN);
  assert.equal(res.status, "in");
});

test("queued: 3rd wrong PIN in 24 h alerts the admin once, 4th adds none", async () => {
  const c = "q-pin-alert";
  await seed(c);
  await assert.rejects(queuedPunch(c, "in", Date.now() - HOUR, { pin: "0000" }));
  await assert.rejects(queuedPunch(c, "in", Date.now() - HOUR, { pin: "0001" }));
  assert.equal((await alertsOf(c, "syncWrongPin")).length, 0);
  await assert.rejects(queuedPunch(c, "in", Date.now() - HOUR, { pin: "0002" }));
  await assert.rejects(queuedPunch(c, "in", Date.now() - HOUR, { pin: "0003" }));
  const alerts = await alertsOf(c, "syncWrongPin");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].employeeId, "emp1");
  assert.equal(alerts[0].severity, "warning");
  assert.ok(!JSON.stringify(alerts[0]).includes(PIN));
});

test("queued: from the 5th wrong PIN in 24 h queued punches are blocked; online still works; clears after 24 h", async (t) => {
  const c = "q-pin-block";
  await seed(c);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-29T15:00:00Z") });
  for (let i = 0; i < 5; i++) {
    await assert.rejects(queuedPunch(c, "in", Date.now() - HOUR, { pin: "0000" }), reasonIs("wrongPin"));
  }
  await assert.rejects(queuedPunch(c, "in", Date.now() - HOUR), (err) => {
    reasonIs("syncBlocked")(err);
    assert.equal(err.message, COULDNT_SYNC);
    return true;
  });
  // A blocked attempt is not counted as another wrong PIN.
  assert.equal((await failDoc(c).get()).data().failures.length, 5);
  const online = await punch(c, "in");
  assert.equal(online.status, "in");
  t.mock.timers.tick(24 * HOUR + MIN);
  const later = await queuedPunch(c, "out", Date.now() - MIN);
  assert.equal(later.status, "out");
});

// ===================== queued: PIN changed before it synced (Phase 5, no Redo) =====================

const historyDoc = (c) => db.doc(`companies/${c}/employeePinHistory/emp1`);
const adminAuth = (c) => ({ uid: "admin1", token: { role: "admin", companyId: c } });
const setPin = (c, pin) => funcs.setEmployeePin.run({ data: { employeeId: "emp1", pin }, auth: adminAuth(c), rawRequest: {} });

test("PIN change: the old PIN is kept as a salted hash with server times; the same PIN adds nothing", async () => {
  const c = "q-hist-write";
  await seed(c);
  await setPin(c, PIN);
  assert.equal((await historyDoc(c).get()).exists, false);
  const before = Date.now();
  await setPin(c, "5678");
  const hist = (await historyDoc(c).get()).data();
  assert.equal(hist.entries.length, 1);
  const [e] = hist.entries;
  assert.ok(e.untilMs >= before && e.untilMs <= Date.now());
  assert.equal(hist.lastChangeMs, e.untilMs);
  assert.ok(typeof e.salt === "string" && e.hash.length === 64);
  assert.ok(!JSON.stringify(hist).includes(PIN) && !JSON.stringify(hist).includes("5678"));
  await setPin(c, "9012");
  const two = (await historyDoc(c).get()).data();
  assert.equal(two.entries.length, 2);
  assert.equal(two.entries[1].fromMs, e.untilMs);
});

test("queued: PIN changed after the punch was made -> syncs at its own time, oldPinAccepted, not a wrong PIN", async () => {
  const c = "q-hist-old";
  await seed(c);
  const madeMs = Date.now() - HOUR;
  await setPin(c, "5678");
  const res = await queuedPunch(c, "in", madeMs);
  assert.equal(res.status, "in");
  const [ev] = await events(c);
  assert.equal(ev.timestamp.toMillis(), madeMs);
  assert.equal(ev.queued, true);
  assert.equal(ev.oldPinAccepted, true);
  assert.equal((await failDoc(c).get()).exists, false);
  assert.equal((await alertsOf(c, "syncWrongPin")).length, 0);
  // The new PIN on a later punch: a normal punch, no marker.
  await queuedPunch(c, "out", Date.now() - MIN, { pin: "5678" });
  const out = (await events(c)).find((x) => x.type === "out");
  assert.equal(out.oldPinAccepted, undefined);
});

test("queued: old PIN on a punch made AFTER the change -> refused for good, Couldn't sync, counted", async (t) => {
  const c = "q-hist-after";
  await seed(c);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-29T15:00:00Z") });
  const changeMs = Date.now();
  await setPin(c, "5678");
  t.mock.timers.tick(10 * MIN);
  const requestId = randomUUID();
  await assert.rejects(queuedPunch(c, "in", changeMs + 5 * MIN, { requestId }), (err) => {
    reasonIs("wrongPin")(err);
    assert.equal(err.message, COULDNT_SYNC);
    assert.equal(err.details.queued, true);
    return true;
  });
  assert.equal((await events(c)).length, 0);
  assert.equal((await failDoc(c).get()).data().failures.length, 1);
  assert.ok(deleted.includes(`companies/${c}/clockEvents/emp1/${requestId}.jpg`));
});

test("queued: PIN changed twice while offline -> each punch needs the PIN of its own time", async (t) => {
  const c = "q-hist-twice";
  await seed(c);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-29T15:00:00Z") });
  const T0 = Date.now();
  await setPin(c, "5678");
  t.mock.timers.tick(HOUR);
  await setPin(c, "9012");
  t.mock.timers.tick(HOUR);
  assert.equal((await queuedPunch(c, "in", T0 - 30 * MIN)).status, "in");
  await assert.rejects(queuedPunch(c, "out", T0 + 30 * MIN), reasonIs("wrongPin"));
  assert.equal((await queuedPunch(c, "out", T0 + 30 * MIN, { pin: "5678" })).status, "out");
  await assert.rejects(queuedPunch(c, "in", T0 + 90 * MIN, { pin: "5678" }), reasonIs("wrongPin"));
  assert.equal((await queuedPunch(c, "in", T0 + 90 * MIN, { pin: "9012" })).status, "in");
  const evs = await events(c);
  assert.equal(evs.length, 3);
  assert.deepEqual(evs.filter((x) => x.oldPinAccepted).length, 2);
  assert.equal((await failDoc(c).get()).data().failures.length, 2);
});

test("queued: old PIN refused when the phone clock was set back; the current PIN still works", async () => {
  const c = "q-hist-clockoff";
  await seed(c);
  const madeMs = Date.now() - HOUR;
  await setPin(c, "5678");
  // expectedAtMs 10 min after the phone's time = the clock was set back.
  await assert.rejects(queuedPunch(c, "in", madeMs, { extra: { expectedAtMs: madeMs + 10 * MIN } }), reasonIs("wrongPin"));
  const res = await queuedPunch(c, "in", madeMs, { pin: "5678", extra: { expectedAtMs: madeMs + 10 * MIN } });
  assert.equal(res.status, "in");
  const [ev] = await events(c);
  assert.equal(ev.phoneClockOff, true);
  assert.equal(ev.oldPinAccepted, undefined);
});

test("queued fast sync: the server's time decides which PIN was right", async () => {
  const c = "q-hist-fast";
  await seed(c);
  await setPin(c, "5678");
  // The phone claims an hour ago, but the punch waited only 30 s: made after the change.
  await assert.rejects(queuedPunch(c, "in", Date.now() - HOUR, { extra: { waitMs: 30 * 1000 } }), reasonIs("wrongPin"));

  const c2 = "q-hist-fast2";
  await seed(c2);
  await setPin(c2, "5678");
  // Waited 90 s and the change was moments ago: made before it.
  const res = await queuedPunch(c2, "in", Date.now() - 90 * 1000, { extra: { waitMs: 90 * 1000 } });
  assert.equal(res.status, "in");
  const [ev] = await events(c2);
  assert.equal(ev.oldPinAccepted, true);
  assert.equal(ev.queued, undefined, "a fast sync still looks like an online punch");
});

test("online punch: only the current PIN, the old one is a normal wrong PIN", async () => {
  const c = "q-hist-online";
  await seed(c);
  await setPin(c, "5678");
  await assert.rejects(punch(c, "in"), (err) => reasonIs("wrongPin")(err) && err.details.attemptsLeft === 2);
  assert.equal((await punch(c, "in", { pin: "5678" })).status, "in");
});

// ===================== trigger: late punch into an approved timesheet =====================

async function approveShift(c, clockInId) {
  await db.doc(`companies/${c}/timesheetApprovals/${clockInId}`).set({ status: "approved" }, { merge: true });
}

test("trigger: queued clock out into an APPROVED timesheet alerts the admin; it stays approved", async () => {
  const c = "q-approved";
  await seed(c);
  const now = Date.now();
  const rIn = await queuedPunch(c, "in", now - 5 * HOUR);
  await runTrigger(c, rIn.eventId);
  await approveShift(c, rIn.eventId);
  const rOut = await queuedPunch(c, "out", now - HOUR);
  await runTrigger(c, rOut.eventId);
  const alerts = await alertsOf(c, "syncedLateApproved");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].eventId, rOut.eventId);
  assert.equal((await db.doc(`companies/${c}/timesheetApprovals/${rIn.eventId}`).get()).data().status, "approved");
});

test("trigger: a QUICK queued punch (no Synced late tag) into an approved timesheet still alerts", async () => {
  const c = "q-approved-quick";
  await seed(c);
  const rIn = await queuedPunch(c, "in", Date.now() - 5 * HOUR);
  await runTrigger(c, rIn.eventId);
  await approveShift(c, rIn.eventId);
  const rOut = await queuedPunch(c, "out", Date.now() - 10 * 1000);
  const ev = await runTrigger(c, rOut.eventId);
  assert.equal(ev.queued, true);
  assert.equal(ev.syncedLate, undefined);
  assert.equal((await alertsOf(c, "syncedLateApproved")).length, 1);
});

test("trigger: queued punch into a PENDING timesheet, or an online one into an approved one, makes no alert", async () => {
  const c = "q-approved-no";
  await seed(c);
  const now = Date.now();
  const rIn = await queuedPunch(c, "in", now - 5 * HOUR);
  await runTrigger(c, rIn.eventId);
  const rBs = await queuedPunch(c, "breakStart", now - 4 * HOUR);
  await runTrigger(c, rBs.eventId);
  assert.equal((await alertsOf(c, "syncedLateApproved")).length, 0);
  await approveShift(c, rIn.eventId);
  const rBe = await punch(c, "breakEnd");
  await runTrigger(c, rBe.eventId);
  assert.equal((await alertsOf(c, "syncedLateApproved")).length, 0);
});

// ===================== fast sync + phoneClockOff =====================

const near = (a, b, ms = 3000) => Math.abs(a - b) <= ms;

test("fast: a queued punch sent within 2 min gets server time minus the wait and looks online", async () => {
  const c = "q-fast";
  await seed(c);
  const before = Date.now();
  const r = await queuedPunch(c, "in", before - 3000, { extra: { waitMs: 3000 } });
  assert.ok(near(r.timestampMs, before - 3000));
  assert.ok(typeof r.serverNowMs === "number" && near(r.serverNowMs, Date.now()));
  await queuedPunch(c, "breakStart", Date.now() - 500, { extra: { waitMs: 500 } });
  const evs = await events(c);
  for (const e of evs) {
    assert.equal(e.queued, undefined);
    assert.equal(e.syncedLate, undefined);
    assert.equal(e.phoneClockOff, undefined);
  }
});

test("fast: phone clock set back 1 h (or 25 h) -> server time, phoneClockOff, never tooOld", async () => {
  const c = "q-fast-clock";
  await seed(c);
  const r = await queuedPunch(c, "in", Date.now() - HOUR, { extra: { waitMs: 2000 } });
  assert.ok(near(r.timestampMs, Date.now() - 2000));
  const r2 = await queuedPunch(c, "breakStart", Date.now() - 25 * HOUR, { extra: { waitMs: 1000 } });
  assert.ok(near(r2.timestampMs, Date.now() - 1000));
  const evs = await events(c);
  assert.deepEqual(evs.map((e) => [e.phoneClockOff, e.queued]), [[true, undefined], [true, undefined]]);
});

test("fast: a wait over 2 min is a normal queued punch (phone time, queued)", async () => {
  const c = "q-fast-over";
  await seed(c);
  const at = Date.now() - 3 * MIN;
  const r = await queuedPunch(c, "in", at, { extra: { waitMs: 3 * MIN } });
  assert.equal(r.timestampMs, at);
  const [e] = await events(c);
  assert.equal(e.queued, true);
  assert.equal(e.phoneClockOff, undefined);
});

test("fast: right after a punch into an approved timesheet makes no alert (same as online)", async () => {
  const c = "q-fast-approved";
  await seed(c);
  const rIn = await queuedPunch(c, "in", Date.now() - 5 * HOUR);
  await runTrigger(c, rIn.eventId);
  await approveShift(c, rIn.eventId);
  const rOut = await queuedPunch(c, "out", Date.now() - 2000, { extra: { waitMs: 2000 } });
  const ev = await runTrigger(c, rOut.eventId);
  assert.equal(ev.queued, undefined);
  assert.equal((await alertsOf(c, "syncedLateApproved")).length, 0);
});

// T15: clock set back 1 h, punch offline, app killed (no waitMs), clock
// fixed, synced 20 min later. The phone's expected time (last server time
// + uptime) is 1 h after the punch's phone time -> flagged.
test("expected time: phone time 2+ min EARLIER than expected -> phoneClockOff (slow sync, app killed)", async () => {
  const c = "q-expected";
  await seed(c);
  const realAt = Date.now() - 20 * MIN;
  const phoneAt = realAt - HOUR;
  const err = await queuedPunch(c, "in", phoneAt, { extra: { expectedAtMs: realAt } }).catch((e) => e);
  // An hour+ in the past is still inside the 24 h window, so it lands.
  assert.ok(!(err instanceof Error), err && err.message);
  const [e] = await events(c);
  assert.equal(e.timestamp.toMillis(), phoneAt);
  assert.equal(e.queued, true);
  assert.equal(e.syncedLate, true);
  assert.equal(e.phoneClockOff, true);
});

test("expected time: phone time later than expected (phone slept), or within 2 min, is not flagged", async () => {
  const c = "q-expected-ok";
  await seed(c);
  // Uptime paused while the phone slept: expected lags 30 min behind.
  await queuedPunch(c, "in", Date.now() - 10 * MIN, { extra: { expectedAtMs: Date.now() - 40 * MIN } });
  await queuedPunch(c, "breakStart", Date.now() - 5 * MIN, { extra: { expectedAtMs: Date.now() - 5 * MIN + 90 * 1000 } });
  await queuedPunch(c, "breakEnd", Date.now() - 2 * MIN);
  const evs = await events(c);
  assert.deepEqual(evs.map((e) => e.phoneClockOff), [undefined, undefined, undefined]);
});

test("fast/expected: bad input (wait without a queued time, negative wait)", async () => {
  const c = "q-fast-bad";
  await seed(c);
  await assert.rejects(punch(c, "breakStart", { extra: { waitMs: 100 } }), reasonIs("invalid"));
  await assert.rejects(punch(c, "breakStart", { extra: { expectedAtMs: Date.now() } }), reasonIs("invalid"));
  await assert.rejects(queuedPunch(c, "breakStart", Date.now(), { extra: { waitMs: -1 } }), reasonIs("invalid"));
});

test("PIN check answers with the server time", async () => {
  const c = "q-pin-time";
  await seed(c);
  const r = await callPunch(c, { action: "in", requestId: randomUUID(), pin: PIN, checkPinOnly: true });
  assert.equal(r.pinOk, true);
  assert.ok(near(r.serverNowMs, Date.now()));
});
