// RC1 - setEmployeeRole (functions/src/employees.ts) in every direction.
// Runs the REAL compiled callable (lib/) against the Firestore + Auth
// emulators.
//
// Checks per direction: the employee doc toggles, users/{uid}.role, the
// custom claims, and roleChangedAt - and that the claims are already set
// when the users doc changes (the signed-in app refreshes its token the
// moment it sees the users doc change, so it must get the new claims).
//
// Run: firebase emulators:exec --only firestore,auth "node --test test/employeeRole.test.js"
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "localhost:8090";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

const call = (data, auth) => funcs.setEmployeeRole.run({ data, auth, rawRequest: {} });
const ownerAuth = (c) => ({ uid: `owner-${c}`, token: { role: "owner", companyId: c } });

// Records the users doc role at the moment the claims are set.
const roleSeenAtClaims = [];
const authApi = admin.auth();
const realSetClaims = authApi.setCustomUserClaims.bind(authApi);
authApi.setCustomUserClaims = async (uid, claims) => {
  const snap = await db.doc(`users/${uid}`).get();
  roleSeenAtClaims.push({ uid, usersRole: snap.exists ? snap.data().role : null, claimsRole: claims.role });
  return realSetClaims(uid, claims);
};

async function seed(c, { role, appAccess = true, isSupervisor = false, isAdmin = false }) {
  const uid = `uid-${c}`;
  await admin.auth().deleteUser(uid).catch(() => {});
  await admin.auth().createUser({ uid, email: `${c}@example.com` });
  await realSetClaims(uid, { role, companyId: c, employeeId: "emp1" });
  await db.doc(`companies/${c}`).set({ name: "Co " + c });
  await db.doc(`companies/${c}/employees/emp1`).set({
    name: "Drops",
    active: true,
    linkedUserId: uid,
    appAccess,
    isSupervisor,
    isAdmin,
  });
  await db.doc(`users/${uid}`).set({ role, companyId: c, name: "Drops", email: `${c}@example.com` });
  return uid;
}

async function state(c, uid) {
  const emp = (await db.doc(`companies/${c}/employees/emp1`).get()).data();
  const user = (await db.doc(`users/${uid}`).get()).data();
  const claims = (await admin.auth().getUser(uid)).customClaims;
  return { emp, user, claims };
}

async function change(c, uid, toggles, expectedRole) {
  const before = Date.now();
  await call({ employeeId: "emp1", ...toggles }, ownerAuth(c));
  const { emp, user, claims } = await state(c, uid);
  assert.equal(emp.isSupervisor, !!toggles.isSupervisor);
  assert.equal(emp.isAdmin, !!toggles.isAdmin);
  assert.equal(user.role, expectedRole, "users doc role");
  assert.deepEqual(claims, { role: expectedRole, companyId: c, employeeId: "emp1" }, "claims");
  assert.ok(user.roleChangedAt, "roleChangedAt stamped");
  assert.ok(user.roleChangedAt.toMillis() >= before - 5000, "roleChangedAt is now");
  const seen = roleSeenAtClaims.filter((r) => r.uid === uid).pop();
  assert.equal(seen.claimsRole, expectedRole);
  return user.roleChangedAt.toMillis();
}

test("RC1: employee -> supervisor: claims first, then users doc + roleChangedAt", async () => {
  const c = "rc1-e2s";
  const uid = await seed(c, { role: "employee" });
  await change(c, uid, { isSupervisor: true }, "supervisor");
  const seen = roleSeenAtClaims.filter((r) => r.uid === uid).pop();
  assert.equal(seen.usersRole, "employee", "users doc still old role when claims were set");
  assert.equal(seen.claimsRole, "supervisor");
});

test("RC1: supervisor -> employee (both off, Employee App login): drops to employee", async () => {
  const c = "rc1-s2e";
  const uid = await seed(c, { role: "supervisor", isSupervisor: true });
  await change(c, uid, { isSupervisor: false, isAdmin: false }, "employee");
  const seen = roleSeenAtClaims.filter((r) => r.uid === uid).pop();
  assert.equal(seen.usersRole, "supervisor");
});

test("RC1: supervisor -> admin and admin -> supervisor, roleChangedAt moves forward each time", async () => {
  const c = "rc1-s2a";
  const uid = await seed(c, { role: "supervisor", isSupervisor: true });
  const t1 = await change(c, uid, { isSupervisor: true, isAdmin: true }, "admin");
  await new Promise((r) => setTimeout(r, 20));
  const t2 = await change(c, uid, { isSupervisor: true, isAdmin: false }, "supervisor");
  assert.ok(t2 > t1, "second change has a later roleChangedAt");
});

test("RC1: no appAccess + both off keeps the legacy supervisor floor (and still stamps)", async () => {
  const c = "rc1-floor";
  const uid = await seed(c, { role: "admin", appAccess: false, isAdmin: true });
  await change(c, uid, { isSupervisor: false, isAdmin: false }, "supervisor");
});

test("RC1: refused callers change nothing (no stamp)", async () => {
  const c = "rc1-refused";
  const uid = await seed(c, { role: "employee" });
  await assert.rejects(call({ employeeId: "emp1", isSupervisor: true }, { uid: "x", token: { role: "supervisor", companyId: c } }));
  const { user, claims } = await state(c, uid);
  assert.equal(user.role, "employee");
  assert.equal(user.roleChangedAt, undefined);
  assert.equal(claims.role, "employee");
});
