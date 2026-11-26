// Biometric audit b - Employee App "Delete account" (deleteMyEmployeeAccount,
// functions/src/employeeAccount.ts). Runs the REAL compiled callable (lib/)
// against the Firestore + Auth emulators; Storage goes to an in-memory fake.
//
// Run: firebase emulators:exec --only firestore,auth "node --test test/employeeAccount.test.js"
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "localhost:8090";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");
const { employeePinRef, employeePinData } = require("../lib/lib/employeePin.js");

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

const call = (data, auth) => funcs.deleteMyEmployeeAccount.run({ data, auth, rawRequest: {} });
const employeeAuth = (c, uid, employeeId = "emp1") => ({ uid, token: { role: "employee", companyId: c, employeeId } });
const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const urlFor = (path) =>
  `https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=t`;

const co = (c) => db.doc(`companies/${c}`);
const empRef = (c) => db.doc(`companies/${c}/employees/emp1`);

async function authUserExists(uid) {
  try {
    await admin.auth().getUser(uid);
    return true;
  } catch (err) {
    if (err.code === "auth/user-not-found") return false;
    throw err;
  }
}

// One app employee: Auth login, users doc, PIN 4821 (all three PIN records),
// reference photo, consent, push token, two of their own alerts, a pending
// PIN counter, and a finished shift (in + out) with a face result.
async function seed(c, planTier, { lastType = "out" } = {}) {
  deletedPaths.length = 0;
  deletedPrefixes.length = 0;
  const uid = `uid-${c}`;
  try {
    await admin.auth().deleteUser(uid);
  } catch {}
  await admin.auth().createUser({ uid, email: `${c}@example.com` });
  await co(c).set({ name: "Co", planTier });
  const photoUrl = urlFor(`companies/${c}/employees/emp1/reference.jpg`);
  await empRef(c).set({
    name: "Ana",
    active: true,
    assignedSiteIds: [],
    linkedUserId: uid,
    email: `${c}@example.com`,
    appAccess: true,
    joinedVia: "qr",
    photoUrl,
  });
  await db.doc(`users/${uid}`).set({ role: "employee", companyId: c, email: `${c}@example.com` });
  await db.doc(`companies/${c}/pins/4821`).set({ employeeId: "emp1" });
  await employeePinRef(c, "emp1").set(employeePinData("4821"));
  await db.doc(`companies/${c}/employeePinHistory/emp1`).set({ pins: [] });
  await db.doc(`companies/${c}/employeePushTokens/emp1`).set({ token: "ExponentPushToken[x]" });
  await db.doc(`companies/${c}/employeeAlerts/a1`).set({ employeeId: "emp1", title: "x" });
  await db.doc(`companies/${c}/employeeAlerts/a2`).set({ employeeId: "emp1", title: "y" });
  await db.doc(`companies/${c}/employeeAlerts/other`).set({ employeeId: "emp2", title: "z" });
  await db.doc(`pinAttempts/${uid}`).set({ count: 1 });
  await db.doc(`companies/${c}/employeeConsents/emp1`).set({ employeeId: "emp1", faceDataDeletedAt: null });

  const start = Date.now() - 3 * 60 * 60 * 1000;
  const events = {
    e1: {
      employeeId: "emp1",
      employeeName: "Ana",
      type: "in",
      source: "employeeApp",
      timestamp: ts(start),
      photoUrl: urlFor(`companies/${c}/clockEvents/emp1/e1.jpg`),
      faceCheck: { status: "match", similarity: 99.1, threshold: 90, referencePhotoUrl: photoUrl, facesInTarget: 1, checkedAt: ts(start) },
    },
    e2: { employeeId: "emp1", employeeName: "Ana", type: lastType, source: "employeeApp", timestamp: ts(start + 60 * 60 * 1000) },
  };
  for (const [id, e] of Object.entries(events)) await db.doc(`companies/${c}/clockEvents/${id}`).set(e);
  return { uid, events };
}

async function assertDeleted(c, uid, events) {
  assert.equal(await authUserExists(uid), false, "Auth login deleted");
  assert.equal((await db.doc(`users/${uid}`).get()).exists, false);
  assert.equal((await db.doc(`pinAttempts/${uid}`).get()).exists, false);

  // Photos: the reference photo and the whole folder (selfie, updates).
  assert.ok(deletedPaths.includes(`companies/${c}/employees/emp1/reference.jpg`));
  assert.ok(deletedPrefixes.includes(`companies/${c}/employees/emp1/`));
  assert.ok(!deletedPaths.some((p) => p.includes("/clockEvents/")));

  // PIN records.
  assert.equal((await db.doc(`companies/${c}/pins/4821`).get()).exists, false);
  assert.equal((await employeePinRef(c, "emp1").get()).exists, false);
  assert.equal((await db.doc(`companies/${c}/employeePinHistory/emp1`).get()).exists, false);

  // Push token and their own alerts (another employee's stays).
  assert.equal((await db.doc(`companies/${c}/employeePushTokens/emp1`).get()).exists, false);
  assert.equal((await db.doc(`companies/${c}/employeeAlerts/a1`).get()).exists, false);
  assert.equal((await db.doc(`companies/${c}/employeeAlerts/a2`).get()).exists, false);
  assert.equal((await db.doc(`companies/${c}/employeeAlerts/other`).get()).exists, true);

  // The row stays: unlinked, deactivated, marked.
  const emp = (await empRef(c).get()).data();
  assert.equal(emp.name, "Ana");
  assert.equal(emp.linkedUserId, undefined);
  assert.equal(emp.email, undefined);
  assert.equal(emp.appAccess, undefined);
  assert.equal(emp.photoUrl, undefined);
  assert.equal(emp.active, false);
  assert.ok(emp.deactivatedAt);
  assert.ok(emp.appAccountDeletedAt);

  // Clock events (and their face results) are byte-identical.
  for (const [id, e] of Object.entries(events)) {
    assert.deepEqual((await db.doc(`companies/${c}/clockEvents/${id}`).get()).data(), e);
  }
  const all = await db.collection(`companies/${c}/clockEvents`).get();
  assert.equal(all.size, Object.keys(events).length, "no new clock event (no auto clock-out)");

  // Consent kept as proof, stamped.
  const consent = (await db.doc(`companies/${c}/employeeConsents/emp1`).get()).data();
  assert.ok(consent.faceDataDeletedAt);
  assert.equal(consent.faceDataDeletedReason, "accountDeleted");

  // Website-only admin alert.
  const alerts = await db.collection(`companies/${c}/alerts`).where("alertType", "==", "employeeAccountDeleted").get();
  assert.equal(alerts.size, 1);
  const alert = alerts.docs[0].data();
  assert.equal(alert.employeeId, "emp1");
  assert.equal(alert.severity, "info");
  assert.match(alert.message, /Ana deleted their OrbitsWorks app account/);
}

test("deleteMyEmployeeAccount (Pro): deletes login, photos and PIN; keeps the row and clock history; alerts the admin", async () => {
  const c = "acct-pro";
  const { uid, events } = await seed(c, "pro_tier1");
  assert.deepEqual(await call({ confirm: true }, employeeAuth(c, uid)), { deleted: true });
  await assertDeleted(c, uid, events);
});

test("deleteMyEmployeeAccount (Core): works the same", async () => {
  const c = "acct-core";
  const { uid, events } = await seed(c, "core_tier1");
  assert.deepEqual(await call({ confirm: true }, employeeAuth(c, uid)), { deleted: true });
  await assertDeleted(c, uid, events);
});

for (const lastType of ["in", "breakStart", "breakEnd"]) {
  test(`deleteMyEmployeeAccount: refused while clocked in (last event ${lastType}) - nothing changes`, async () => {
    const c = `acct-open-${lastType}`;
    const { uid } = await seed(c, "pro_tier1", { lastType });
    await assert.rejects(call({ confirm: true }, employeeAuth(c, uid)), /Clock out first, then delete your account\./);
    assert.equal(await authUserExists(uid), true);
    const emp = (await empRef(c).get()).data();
    assert.equal(emp.linkedUserId, uid);
    assert.equal(emp.active, true);
    assert.ok(emp.photoUrl);
    assert.equal(deletedPrefixes.length, 0);
    assert.equal((await db.doc(`companies/${c}/pins/4821`).get()).exists, true);
    assert.equal((await db.collection(`companies/${c}/clockEvents`).get()).size, 2, "no auto clock-out");
  });
}

test("deleteMyEmployeeAccount: employee login only, own row only, confirm required", async () => {
  const c = "acct-auth";
  const { uid } = await seed(c, "pro_tier1");
  await assert.rejects(call({ confirm: true }, undefined), /signed in/);
  await assert.rejects(
    call({ confirm: true }, { uid, token: { role: "supervisor", companyId: c, employeeId: "emp1" } }),
    /Only an employee app login/
  );
  // Final audit B: an admin whose app type is the Employee app is refused too.
  await assert.rejects(
    call({ confirm: true }, { uid, token: { role: "admin", appMode: "employee", companyId: c, employeeId: "emp1" } }),
    /Admin logins can't be deleted here/
  );
  await assert.rejects(call({}, employeeAuth(c, uid)), /confirm/);
  await assert.rejects(call({ confirm: true, employeeId: "emp1" }, employeeAuth(c, uid)), /confirm/);
  await assert.rejects(call({ confirm: true }, employeeAuth(c, "someone-else")), /isn't linked/);
  assert.equal(await authUserExists(uid), true);
  assert.equal((await empRef(c).get()).data().linkedUserId, uid);
});

test("deleteMyEmployeeAccount: a retry after the Auth delete failed finishes the job", async () => {
  const c = "acct-retry";
  const { uid } = await seed(c, "pro_tier1");
  // As if the first call finished everything but the Auth delete.
  await empRef(c).update({
    linkedUserId: admin.firestore.FieldValue.delete(),
    active: false,
    appAccountDeletedAt: admin.firestore.Timestamp.now(),
  });
  assert.deepEqual(await call({ confirm: true }, employeeAuth(c, uid)), { deleted: true });
  assert.equal(await authUserExists(uid), false);
  assert.equal((await db.doc(`users/${uid}`).get()).exists, false);
});
