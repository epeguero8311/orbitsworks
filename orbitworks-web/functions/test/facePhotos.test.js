// Biometric audit c + d - "Remove photo" (removeEmployeePhoto) and the
// employee-delete photo cleanup (functions/src/facePhotos.ts). Runs the REAL
// compiled callables (lib/) against the Firestore emulator; Storage goes to
// an in-memory fake, so no test reaches Storage.
//
// Run: firebase emulators:exec --only firestore "node --test test/facePhotos.test.js"
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

const deletedPaths = [];
const deletedPrefixes = [];
admin.storage().bucket = () => ({
  file: (p) => ({
    delete: async () => {
      deletedPaths.push(p);
    },
  }),
  deleteFiles: async ({ prefix }) => {
    deletedPrefixes.push(prefix);
  },
});

const call = (fn, data, auth) => funcs[fn].run({ data, auth, rawRequest: {} });
const adminAuth = (c) => ({ uid: "admin-" + c, token: { role: "admin", companyId: c } });
const supervisorAuth = (c) => ({ uid: "sup-" + c, token: { role: "supervisor", companyId: c } });
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const urlFor = (path) =>
  `https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=t`;

const empRef = (c, id = "emp1") => db.doc(`companies/${c}/employees/${id}`);
const eventRef = (c, id) => db.doc(`companies/${c}/clockEvents/${id}`);
const consentRef = (c, id = "emp1") => db.doc(`companies/${c}/employeeConsents/${id}`);

// A Pro company, one employee with a reference photo, a bad-reference flag,
// a consent record and one clock event with a face result.
async function seed(c) {
  deletedPaths.length = 0;
  deletedPrefixes.length = 0;
  await db.doc(`companies/${c}`).set({ name: "Co", planTier: "pro_tier1" });
  const photoUrl = urlFor(`companies/${c}/employees/emp1/reference.jpg`);
  await empRef(c).set({
    name: "Ana",
    active: true,
    assignedSiteIds: [],
    photoUrl,
    faceReference: { status: "bad", photoUrl, reason: "noFace", flaggedAt: ts(Date.now()) },
  });
  await consentRef(c).set({ employeeId: "emp1", faceDataDeletedAt: null, biometricConsentVersion: "v1" });
  const event = {
    employeeId: "emp1",
    employeeName: "Ana",
    type: "out",
    source: "employeeApp",
    timestamp: ts(Date.now() - 60 * 60 * 1000),
    photoUrl: urlFor(`companies/${c}/clockEvents/emp1/e1.jpg`),
    faceCheck: { status: "match", similarity: 99.1, threshold: 90, referencePhotoUrl: photoUrl, facesInTarget: 1, checkedAt: ts(Date.now()) },
  };
  await eventRef(c, "e1").set(event);
  return { photoUrl, event };
}

test("removeEmployeePhoto: deletes every face photo, clears photoUrl + faceReference, records who/when", async () => {
  const c = "fp-remove";
  const { event } = await seed(c);

  const res = await call("removeEmployeePhoto", { employeeId: "emp1" }, adminAuth(c));
  assert.deepEqual(res, { removed: true });

  assert.ok(deletedPaths.includes(`companies/${c}/employees/emp1/reference.jpg`));
  assert.ok(deletedPrefixes.includes(`companies/${c}/employees/emp1/`));
  assert.ok(!deletedPaths.some((p) => p.includes("/clockEvents/")));

  const emp = (await empRef(c).get()).data();
  assert.equal(emp.photoUrl, undefined);
  assert.equal(emp.faceReference, undefined);
  assert.ok(emp.facePhotoRemovedAt);
  assert.equal(emp.facePhotoRemovedByUid, "admin-" + c);
  assert.equal(emp.name, "Ana");
  assert.equal(emp.active, true);

  // The clock event, its photo and its face result are untouched.
  assert.deepEqual((await eventRef(c, "e1").get()).data(), event);

  const consent = (await consentRef(c).get()).data();
  assert.ok(consent.faceDataDeletedAt);
  assert.equal(consent.faceDataDeletedReason, "photoRemoved");
});

test("removeEmployeePhoto: admin/owner only, own company only, strict input", async () => {
  const c = "fp-auth";
  await seed(c);
  await assert.rejects(call("removeEmployeePhoto", { employeeId: "emp1" }, supervisorAuth(c)), /Not authorized/);
  await assert.rejects(call("removeEmployeePhoto", { employeeId: "emp1" }, undefined), /signed in/);
  await assert.rejects(call("removeEmployeePhoto", { employeeId: "emp1", companyId: "x" }, adminAuth(c)), /employeeId/);
  // Another company's admin gets not-found (its own company has no emp1).
  await db.doc("companies/fp-other").set({ name: "Other" });
  await assert.rejects(call("removeEmployeePhoto", { employeeId: "emp1" }, adminAuth("fp-other")), /not found/);
  assert.ok((await empRef(c).get()).data().photoUrl);
});

test("removeEmployeePhoto: no photo on file is a harmless no-op that still clears leftovers", async () => {
  const c = "fp-nophoto";
  await seed(c);
  await empRef(c).update({ photoUrl: admin.firestore.FieldValue.delete() });
  const res = await call("removeEmployeePhoto", { employeeId: "emp1" }, adminAuth(c));
  assert.deepEqual(res, { removed: false });
  assert.ok(deletedPrefixes.includes(`companies/${c}/employees/emp1/`));
});

test("removeEmployeePhoto: a photoUrl pointing at a clock photo is never deleted through this path", async () => {
  const c = "fp-guard";
  await seed(c);
  await empRef(c).update({ photoUrl: urlFor(`companies/${c}/clockEvents/emp1/e1.jpg`) });
  await call("removeEmployeePhoto", { employeeId: "emp1" }, adminAuth(c));
  assert.ok(!deletedPaths.some((p) => p.includes("/clockEvents/")));
});

test("deleteEmployee: deletes the whole employee photo folder, keeps clock events, stamps consent", async () => {
  const c = "fp-delete";
  const { event } = await seed(c);
  await call("deleteEmployee", { employeeId: "emp1" }, adminAuth(c));

  assert.ok(deletedPrefixes.includes(`companies/${c}/employees/emp1/`));
  assert.equal((await empRef(c).get()).exists, false);
  assert.deepEqual((await eventRef(c, "e1").get()).data(), event);
  const consent = (await consentRef(c).get()).data();
  assert.equal(consent.faceDataDeletedReason, "employeeDeleted");
});
