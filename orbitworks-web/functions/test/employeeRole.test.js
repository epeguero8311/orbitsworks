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
  // Task 4: a NEW admin's claims also carry the access mirror - no sites,
  // no permissions (D16), sup = still a supervisor (G1 sub A).
  const accessMirror =
    expectedRole === "admin"
      ? { lvl: "admin", allSites: false, perms: [], ...(toggles.isSupervisor ? { sup: true } : {}) }
      : {};
  assert.deepEqual(claims, { role: expectedRole, companyId: c, employeeId: "emp1", ...accessMirror }, "claims");
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

// RC1 follow-up: deactivated while signed in. The login is disabled and its
// refresh tokens revoked (as before); now the users doc also gets
// accessRevokedAt, so a signed-in website forces a token refresh (which a
// disabled login can't get) and signs out within seconds. The role and
// roleChangedAt are left alone (the app's own deactivated screen comes from
// its employee doc listener).
test("RC1: deactivated while signed in - login disabled, users doc stamped accessRevokedAt", async () => {
  for (const role of ["employee", "supervisor", "admin"]) {
    const c = `rc1-deact-${role}`;
    const uid = await seed(c, { role, isSupervisor: role !== "employee", isAdmin: role === "admin" });
    const before = Date.now();
    await funcs.setEmployeeActive.run({ data: { employeeId: "emp1", active: false }, auth: ownerAuth(c), rawRequest: {} });
    const { user } = await state(c, uid);
    assert.ok(user.accessRevokedAt, `${role}: accessRevokedAt stamped`);
    assert.ok(user.accessRevokedAt.toMillis() >= before - 5000);
    assert.equal(user.role, role, "role unchanged");
    assert.equal(user.roleChangedAt, undefined, "not a role change");
    assert.equal((await admin.auth().getUser(uid)).disabled, true);
  }
});

test("RC1: deactivating an employee whose login has no users doc never creates one", async () => {
  const c = "rc1-deact-nodoc";
  const uid = await seed(c, { role: "employee" });
  await db.doc(`users/${uid}`).delete();
  await funcs.setEmployeeActive.run({ data: { employeeId: "emp1", active: false }, auth: ownerAuth(c), rawRequest: {} });
  assert.equal((await db.doc(`users/${uid}`).get()).exists, false);
});

// ---- Task 5 v2 (A): account type = one app type + Admin on top ----
test("appModeFor / loginRoleFor / isEmployeeAppToken", () => {
  const { appModeFor, loginRoleFor, isEmployeeAppToken } = require("../lib/employeeAccess.js");
  // legacy records keep their old mode
  assert.equal(appModeFor({ isAdmin: true }), "supervisor");
  assert.equal(appModeFor({ appAccess: true }), "employee");
  assert.equal(appModeFor({ isSupervisor: true, appAccess: true }), "supervisor");
  assert.equal(appModeFor({}), "supervisor");
  // explicit app type wins
  assert.equal(appModeFor({ isAdmin: true, appType: "employee", appAccess: true }), "employee");
  assert.equal(appModeFor({ isAdmin: true, appType: "none" }), "none");
  assert.equal(appModeFor({ appType: "none" }), "supervisor"); // none only with admin
  assert.equal(appModeFor({ kiosk: true, appType: "employee" }), "kiosk");
  // role claim
  assert.equal(loginRoleFor({ isAdmin: true, appType: "employee" }), "admin");
  assert.equal(loginRoleFor({ appType: "employee", appAccess: true }), "employee");
  assert.equal(loginRoleFor({ appType: "supervisor", appAccess: true }), "supervisor");
  assert.equal(loginRoleFor({ kiosk: true, isAdmin: true }), "kiosk");
  // employee-app callers
  assert.equal(isEmployeeAppToken({ role: "employee" }), true);
  assert.equal(isEmployeeAppToken({ role: "admin", appMode: "employee" }), true);
  assert.equal(isEmployeeAppToken({ role: "admin" }), false);
  assert.equal(isEmployeeAppToken({ role: "supervisor", appMode: "employee" }), false);
  assert.equal(isEmployeeAppToken({ role: "kiosk", appMode: "employee" }), false);
});

test("setEmployeeRoleSchema: kiosk + admin refused, no app + no admin refused", () => {
  const { setEmployeeRoleSchema } = require("../lib/employeeRoleValidators.js");
  assert.equal(setEmployeeRoleSchema.safeParse({ employeeId: "e1", appType: "kiosk", isAdmin: true }).success, false);
  assert.equal(setEmployeeRoleSchema.safeParse({ employeeId: "e1", appType: "none", isAdmin: false }).success, false);
  assert.equal(setEmployeeRoleSchema.safeParse({ employeeId: "e1", appType: "none", isAdmin: true }).success, true);
  assert.equal(setEmployeeRoleSchema.safeParse({ employeeId: "e1", appType: "employee", isAdmin: true }).success, true);
  // old website payload still accepted
  assert.equal(setEmployeeRoleSchema.safeParse({ employeeId: "e1", isAdmin: true, isSupervisor: false }).success, true);
  assert.equal(setEmployeeRoleSchema.safeParse({ employeeId: "e1", appType: "boss" }).success, false);
  assert.equal(setEmployeeRoleSchema.safeParse({ employeeId: "e1", extra: 1 }).success, false);
});

test("pinFreeFor: own live hold or an expired hold is free; assigned never", () => {
  const { pinFreeFor } = require("../lib/employeeCreateExtras.js");
  const ts = (ms) => ({ toMillis: () => ms });
  const now = 1_000_000;
  assert.equal(pinFreeFor(undefined, "u1", now), true);
  assert.equal(pinFreeFor({ employeeId: "e9" }, "u1", now), false);
  assert.equal(pinFreeFor({ employeeId: null }, "u1", now), false); // old placeholder
  assert.equal(pinFreeFor({ employeeId: null, heldByUid: "u1", heldUntil: ts(now + 5000) }, "u1", now), true);
  assert.equal(pinFreeFor({ employeeId: null, heldByUid: "u2", heldUntil: ts(now + 5000) }, "u1", now), false);
  assert.equal(pinFreeFor({ employeeId: null, heldByUid: "u2", heldUntil: ts(now - 1) }, "u1", now), true);
});
