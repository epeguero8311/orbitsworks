// Cloud Functions behavior tests for Face Verification (Pro) - functions/
// src/rekognition.ts. Runs the REAL compiled checkFaceMatch against the
// Firestore emulator (no mocking of Firestore itself), same convention
// alerts.test.js already uses. The AWS Rekognition client and Firebase
// Storage downloads are stubbed - there is no real AWS account or Storage
// emulator reachable from this test, and CompareFaces/DetectFaces results
// are exactly what these tests need to control per-case anyway.
//
// Each test uses its OWN companyId (matching alerts.test.js's own
// convention of c1/c1-allowed/c2.../c8 etc, never reusing one company
// across tests) - node:test's default concurrency runs sibling top-level
// tests in parallel, and the AWS stub below (sendImpl) is shared mutable
// module state, so two tests sharing one companyId/eventId can corrupt
// each other's Firestore doc or stub response. This bit real: reusing
// "c1" everywhere caused a flaky failure when run alongside alerts.test.js
// (also using "c1") until each test got its own company id.
process.env.GCLOUD_PROJECT = "orbitworks-rekognition-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
// Dummy values - the real AWS client (RekognitionClient.prototype.send,
// stubbed below) never actually reads these, but defineSecret(...).value()
// reads straight from process.env in this non-emulated-Functions context
// (same as ALERTS_FEED_ENABLED below), so they must exist at all.
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { RekognitionClient } = require("@aws-sdk/client-rekognition");

// Stub the real AWS call everywhere in this process. Each test reassigns
// sendImpl to its own closure before calling checkFaceMatch, and reads
// sendCallCount afterward - safe across concurrently-running sibling
// tests only because each test's own closure/counter pairing is set
// immediately before its own single awaited checkFaceMatch call, with no
// other awaits in between.
let sendImpl = async () => ({ FaceMatches: [], UnmatchedFaces: [] });
let sendCallCount = 0;
RekognitionClient.prototype.send = async function (command) {
  sendCallCount++;
  return sendImpl(command);
};

// Must load before any admin.storage()/admin.firestore() call below -
// this is what actually runs admin.initializeApp() (see shared.ts).
const { db } = require("../lib/shared.js");
const rekognitionModule = require("../lib/rekognition.js");
// For onEmployeePhotoWrite - an actual Cloud Function trigger, invoked via
// its exported .run(event), same convention alerts.test.js uses for
// onClockEventCreated.
const funcs = require("../lib/index.js");

// Stub Storage downloads too - image content is irrelevant since the AWS
// call itself is stubbed above and never inspects the bytes. admin.storage
// itself is a getter-only namespace export (reassigning it silently
// no-ops), so this instead patches .bucket on the real (lazy, no network
// yet) Storage service instance that both this file and rekognition.ts's
// own admin.storage() calls share.
admin.storage().bucket = () => ({
  file: () => ({
    download: async () => [Buffer.from("fake-image-bytes")],
  }),
});

function setFlags({ alertsFeed, testCompanyIds } = {}) {
  if (alertsFeed === undefined) delete process.env.ALERTS_FEED_ENABLED;
  else process.env.ALERTS_FEED_ENABLED = String(alertsFeed);
  if (testCompanyIds === undefined) delete process.env.TEST_COMPANY_IDS;
  else process.env.TEST_COMPANY_IDS = testCompanyIds;
}

const REFERENCE_PHOTO_URL =
  "https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/companies%2Ftest%2Femployees%2Femp1%2Freference.jpg?alt=media&token=ref-token";
const CLOCK_PHOTO_URL =
  "https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/companies%2Ftest%2FclockEvents%2Femp1%2F123.jpg?alt=media&token=clock-token";

async function seedCompany(companyId, overrides = {}) {
  await db.collection("companies").doc(companyId).set({
    planTier: "pro_tier1",
    faceVerification: { enabled: true },
    ...overrides,
  });
}

async function seedEmployee(companyId, employeeId, overrides = {}) {
  await db
    .collection("companies")
    .doc(companyId)
    .collection("employees")
    .doc(employeeId)
    .set({
      name: "Jordan",
      photoUrl: REFERENCE_PHOTO_URL,
      ...overrides,
    });
}

async function seedClockEvent(companyId, eventId, overrides = {}) {
  await db
    .collection("companies")
    .doc(companyId)
    .collection("clockEvents")
    .doc(eventId)
    .set({
      employeeId: "emp1",
      employeeName: "Jordan",
      type: "in",
      photoUrl: CLOCK_PHOTO_URL,
      timestamp: admin.firestore.Timestamp.fromDate(new Date("2026-06-15T13:00:00Z")),
      ...overrides,
    });
}

async function getEvent(companyId, eventId) {
  const snap = await db.collection("companies").doc(companyId).collection("clockEvents").doc(eventId).get();
  return snap.data();
}

async function getEmployee(companyId, employeeId) {
  const snap = await db.collection("companies").doc(companyId).collection("employees").doc(employeeId).get();
  return snap.data();
}

async function getAlertsByType(companyId, alertType) {
  const snap = await db.collection("companies").doc(companyId).collection("alerts").get();
  return snap.docs.filter((d) => d.data().alertType === alertType);
}

// Duck-types the onDocumentWritten CloudEvent shape onEmployeePhotoWrite's
// handler actually reads (event.params, event.data.before.data(),
// event.data.after.data()/.exists/.ref) - same convention alerts.test.js's
// fakeClockEventDoc uses for the onCreate trigger. after.ref is a REAL
// DocumentReference (not duck-typed) so employeeRef.update() inside the
// handler genuinely writes to the emulator.
function fakeEmployeeWriteEvent({ companyId, employeeId, beforeData, afterData }) {
  const ref = db.collection("companies").doc(companyId).collection("employees").doc(employeeId);
  return {
    params: { companyId, employeeId },
    data: {
      before: { exists: true, data: () => beforeData },
      after: { exists: true, data: () => afterData, ref },
    },
  };
}

test.beforeEach(() => {
  setFlags({ alertsFeed: true });
});

test("match: high similarity writes faceCheck, no alert", async () => {
  const companyId = "face-match";
  await seedCompany(companyId);
  await seedEmployee(companyId, "emp1");
  await seedClockEvent(companyId, "evt1");
  sendImpl = async () => ({ FaceMatches: [{ Similarity: 96.43 }], UnmatchedFaces: [] });
  sendCallCount = 0;

  await rekognitionModule.checkFaceMatch(companyId, "evt1");

  const event = await getEvent(companyId, "evt1");
  assert.equal(event.faceCheck.status, "match");
  assert.equal(event.faceCheck.similarity, 96.4);
  assert.equal(event.faceCheck.threshold, 90);
  assert.equal(event.faceCheck.facesInTarget, 1);
  assert.equal(event.faceCheck.referencePhotoUrl, REFERENCE_PHOTO_URL);
  assert.equal((await getAlertsByType(companyId, "faceMismatch")).length, 0);
  assert.equal((await getAlertsByType(companyId, "faceNoFace")).length, 0);
  assert.equal(sendCallCount, 1);
});

test("mismatch: low similarity writes faceCheck + faceMismatch alert", async () => {
  const companyId = "face-mismatch";
  await seedCompany(companyId);
  await seedEmployee(companyId, "emp1");
  await seedClockEvent(companyId, "evt1");
  sendImpl = async () => ({ FaceMatches: [{ Similarity: 38.12 }], UnmatchedFaces: [] });
  sendCallCount = 0;

  await rekognitionModule.checkFaceMatch(companyId, "evt1");

  const event = await getEvent(companyId, "evt1");
  assert.equal(event.faceCheck.status, "mismatch");
  assert.equal(event.faceCheck.similarity, 38.1);
  const alerts = await getAlertsByType(companyId, "faceMismatch");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].data().employeeId, "emp1");
  assert.match(alerts[0].data().message, /38\.1/);
});

test("noFace: nothing detected writes faceCheck + faceNoFace alert", async () => {
  const companyId = "face-noface";
  await seedCompany(companyId);
  await seedEmployee(companyId, "emp1");
  await seedClockEvent(companyId, "evt1");
  sendImpl = async () => ({ FaceMatches: [], UnmatchedFaces: [] });
  sendCallCount = 0;

  await rekognitionModule.checkFaceMatch(companyId, "evt1");

  const event = await getEvent(companyId, "evt1");
  assert.equal(event.faceCheck.status, "noFace");
  assert.equal(event.faceCheck.similarity, null);
  assert.equal(event.faceCheck.facesInTarget, 0);
  const alerts = await getAlertsByType(companyId, "faceNoFace");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].data().employeeId, "emp1");
});

test("bad reference photo (InvalidParameterException): flags employee, never writes faceCheck", async () => {
  const companyId = "face-badref";
  await seedCompany(companyId);
  await seedEmployee(companyId, "emp1");
  await seedClockEvent(companyId, "evt1");
  sendImpl = async () => {
    throw Object.assign(new Error("no face in source image"), { name: "InvalidParameterException" });
  };
  sendCallCount = 0;

  await rekognitionModule.checkFaceMatch(companyId, "evt1");

  const event = await getEvent(companyId, "evt1");
  assert.equal(event.faceCheck, undefined);

  const employee = await getEmployee(companyId, "emp1");
  assert.equal(employee.faceReference.status, "bad");
  assert.equal(employee.faceReference.reason, "InvalidParameterException");
  assert.equal(employee.faceReference.photoUrl, REFERENCE_PHOTO_URL);

  const badRefSnap = await db.collection("companies").doc(companyId).collection("alerts").doc("badref-emp1").get();
  assert.ok(badRefSnap.exists);
  assert.equal(badRefSnap.data().alertType, "faceBadReference");
});

test("employee already flagged with the SAME bad photo: skips AWS entirely, $0", async () => {
  const companyId = "face-badref-skip";
  await seedCompany(companyId);
  await seedEmployee(companyId, "emp1", {
    faceReference: {
      status: "bad",
      photoUrl: REFERENCE_PHOTO_URL,
      reason: "noFace",
      flaggedAt: admin.firestore.Timestamp.now(),
    },
  });
  await seedClockEvent(companyId, "evt1");
  sendCallCount = 0;

  await rekognitionModule.checkFaceMatch(companyId, "evt1");

  assert.equal(sendCallCount, 0);
  const event = await getEvent(companyId, "evt1");
  assert.equal(event.faceCheck, undefined);
});

test("employee has no pfp: no AWS call, nothing written", async () => {
  const companyId = "face-nopfp";
  await seedCompany(companyId);
  // Deliberately omits photoUrl entirely (Firestore rejects an explicit
  // undefined value) rather than reusing seedEmployee's default.
  await db.collection("companies").doc(companyId).collection("employees").doc("emp1").set({ name: "Jordan" });
  await seedClockEvent(companyId, "evt1");
  sendCallCount = 0;

  await rekognitionModule.checkFaceMatch(companyId, "evt1");

  assert.equal(sendCallCount, 0);
  const event = await getEvent(companyId, "evt1");
  assert.equal(event.faceCheck, undefined);
});

test("feature toggle off: no AWS call, nothing written", async () => {
  const companyId = "face-toggleoff";
  await seedCompany(companyId, { faceVerification: { enabled: false } });
  await seedEmployee(companyId, "emp1");
  await seedClockEvent(companyId, "evt1");
  sendCallCount = 0;

  await rekognitionModule.checkFaceMatch(companyId, "evt1");

  assert.equal(sendCallCount, 0);
  const event = await getEvent(companyId, "evt1");
  assert.equal(event.faceCheck, undefined);
});

test("Core plan with the toggle forced on in the DB: still skipped (server re-checks Pro itself)", async () => {
  const companyId = "face-coreplan";
  await seedCompany(companyId, { planTier: "tier1", faceVerification: { enabled: true } });
  await seedEmployee(companyId, "emp1");
  await seedClockEvent(companyId, "evt1");
  sendCallCount = 0;

  await rekognitionModule.checkFaceMatch(companyId, "evt1");

  assert.equal(sendCallCount, 0);
  const event = await getEvent(companyId, "evt1");
  assert.equal(event.faceCheck, undefined);
});

test("clock photo has no photoUrl: no AWS call, nothing written", async () => {
  const companyId = "face-noclockphoto";
  await seedCompany(companyId);
  await seedEmployee(companyId, "emp1");
  // Deliberately omits photoUrl entirely (Firestore rejects an explicit
  // undefined value) rather than reusing seedClockEvent's default.
  await db.collection("companies").doc(companyId).collection("clockEvents").doc("evt1").set({
    employeeId: "emp1",
    employeeName: "Jordan",
    type: "in",
    timestamp: admin.firestore.Timestamp.fromDate(new Date("2026-06-15T13:00:00Z")),
  });
  sendCallCount = 0;

  await rekognitionModule.checkFaceMatch(companyId, "evt1");

  assert.equal(sendCallCount, 0);
  const event = await getEvent(companyId, "evt1");
  assert.equal(event.faceCheck, undefined);
});

test("faceCheck already present: guard skips re-checking (idempotent)", async () => {
  const companyId = "face-alreadychecked";
  await seedCompany(companyId);
  await seedEmployee(companyId, "emp1");
  await seedClockEvent(companyId, "evt1", {
    faceCheck: {
      status: "match",
      similarity: 99.9,
      threshold: 90,
      referencePhotoUrl: REFERENCE_PHOTO_URL,
      facesInTarget: 1,
      checkedAt: admin.firestore.Timestamp.now(),
    },
  });
  sendCallCount = 0;

  await rekognitionModule.checkFaceMatch(companyId, "evt1");

  assert.equal(sendCallCount, 0);
});

// onEmployeePhotoWrite - the reference-photo check trigger (fires on
// every write to an employee doc, not just photoUrl changes).
test("onEmployeePhotoWrite: a write it makes itself (photoUrl unchanged) never calls DetectFaces", async () => {
  const companyId = "face-ref-loopguard";
  const employeeId = "emp1";
  await seedCompany(companyId);
  await seedEmployee(companyId, employeeId, {
    faceReference: { status: "bad", photoUrl: REFERENCE_PHOTO_URL, reason: "noFace", flaggedAt: admin.firestore.Timestamp.now() },
  });
  sendImpl = async () => ({ FaceDetails: [{}] }); // would clear the flag if the guard failed to stop this
  sendCallCount = 0;

  // Simulates the SECOND invocation this function's own
  // employeeRef.update({faceReference: ...}) write would trigger -
  // photoUrl is identical before/after, only faceReference changed.
  const fakeEvent = fakeEmployeeWriteEvent({
    companyId,
    employeeId,
    beforeData: { name: "Jordan", photoUrl: REFERENCE_PHOTO_URL },
    afterData: {
      name: "Jordan",
      photoUrl: REFERENCE_PHOTO_URL,
      faceReference: { status: "bad", photoUrl: REFERENCE_PHOTO_URL, reason: "noFace" },
    },
  });

  await funcs.onEmployeePhotoWrite.run(fakeEvent);

  assert.equal(sendCallCount, 0);
});

test("onEmployeePhotoWrite: new pfp with exactly 1 face clears an existing bad flag", async () => {
  const companyId = "face-ref-clear";
  const employeeId = "emp1";
  const oldPhotoUrl =
    "https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/companies%2Ftest%2Femployees%2Femp1%2Fold.jpg?alt=media&token=old";
  await seedCompany(companyId);
  await seedEmployee(companyId, employeeId, {
    photoUrl: REFERENCE_PHOTO_URL,
    faceReference: { status: "bad", photoUrl: oldPhotoUrl, reason: "noFace", flaggedAt: admin.firestore.Timestamp.now() },
  });
  sendImpl = async () => ({ FaceDetails: [{}] });
  sendCallCount = 0;

  const fakeEvent = fakeEmployeeWriteEvent({
    companyId,
    employeeId,
    beforeData: { name: "Jordan", photoUrl: oldPhotoUrl, faceReference: { status: "bad", photoUrl: oldPhotoUrl, reason: "noFace" } },
    afterData: { name: "Jordan", photoUrl: REFERENCE_PHOTO_URL, faceReference: { status: "bad", photoUrl: oldPhotoUrl, reason: "noFace" } },
  });

  await funcs.onEmployeePhotoWrite.run(fakeEvent);

  assert.equal(sendCallCount, 1);
  const employee = await getEmployee(companyId, employeeId);
  assert.equal(employee.faceReference, undefined);
});

test("onEmployeePhotoWrite: new pfp with 0 faces sets faceReference bad + faceBadReference alert", async () => {
  const companyId = "face-ref-setbad";
  const employeeId = "emp1";
  await seedCompany(companyId);
  await seedEmployee(companyId, employeeId, { photoUrl: REFERENCE_PHOTO_URL });
  sendImpl = async () => ({ FaceDetails: [] });
  sendCallCount = 0;

  const fakeEvent = fakeEmployeeWriteEvent({
    companyId,
    employeeId,
    beforeData: { name: "Jordan" },
    afterData: { name: "Jordan", photoUrl: REFERENCE_PHOTO_URL },
  });

  await funcs.onEmployeePhotoWrite.run(fakeEvent);

  assert.equal(sendCallCount, 1);
  const employee = await getEmployee(companyId, employeeId);
  assert.equal(employee.faceReference.status, "bad");
  assert.equal(employee.faceReference.reason, "noFace");

  const badRefSnap = await db.collection("companies").doc(companyId).collection("alerts").doc("badref-emp1").get();
  assert.ok(badRefSnap.exists);
  assert.equal(badRefSnap.data().alertType, "faceBadReference");
});
