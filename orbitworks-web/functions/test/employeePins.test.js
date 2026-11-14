// prod-readiness item 7: the plain PIN moves from employees/{id}.pin (every
// admin and supervisor can read it) to the server-only
// employeePins/{employeeId} (functions/src/lib/employeePin.ts).
//
// Phase i (EMPLOYEE_DOC_PIN_REMOVED unset/false): every write goes to BOTH
// places (the live website still reads the old field); every read prefers
// employeePins and falls back to the old field (employees not copied yet).
// Phase ii (EMPLOYEE_DOC_PIN_REMOVED=true): writes stop putting the PIN on
// the employee doc and remove it there on the next PIN change.
//
// Runs the REAL compiled callables against the Firestore + Auth + Storage
// emulators. Each test uses its own company.
//
// Run: firebase emulators:exec --only firestore,auth,storage "node --test test/employeePins.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-employeepins-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.REKOGNITION_ACCESS_KEY_ID = "test-access-key";
process.env.REKOGNITION_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAPBOX_TOKEN = "";
process.env.ALERTS_FEED_ENABLED = "false";
process.env.DEVICE_TRACKING_ENABLED = "false";
process.env.PUSH_NOTIFICATIONS_ENABLED = "false";
delete process.env.EMPLOYEE_DOC_PIN_REMOVED;

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const admin = require("firebase-admin");

const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");
const { pickPin } = require("../lib/lib/employeePin.js");

const call = (fn, data, auth) => funcs[fn].run({ data, auth, rawRequest: {} });
const adminAuth = (c) => ({ uid: "admin-" + c, token: { role: "admin", companyId: c } });
const supervisorAuth = (c) => ({ uid: "sup-" + c, token: { role: "supervisor", companyId: c } });
const employeeAuth = (c) => ({ uid: "uid-" + c, token: { role: "employee", companyId: c, employeeId: "emp1" } });
const phoneHash = (salt, pin) => createHash("sha256").update(`${salt}:${pin}`, "utf8").digest("hex");

const empDoc = (c, id = "emp1") => db.doc(`companies/${c}/employees/${id}`);
const pinDoc = (c, id = "emp1") => db.doc(`companies/${c}/employeePins/${id}`);

// A company with one active, app-linked employee. where: "legacy" = PIN
// only on the employee doc (today's prod data), "moved" = only in
// employeePins (after the copy + strip), "both" = after the copy.
async function seed(c, pin, where) {
  await db.doc(`companies/${c}`).set({ name: "Co " + c, planTier: "pro_tier1" });
  await empDoc(c).set({
    name: "Ana",
    active: true,
    assignedSiteIds: [],
    linkedUserId: "uid-" + c,
    ...(where === "moved" ? {} : { pin }),
  });
  if (where !== "legacy") await pinDoc(c).set({ pin, updatedAt: admin.firestore.Timestamp.now() });
  await db.doc(`companies/${c}/pins/${pin}`).set({ employeeId: "emp1" });
}

test("pickPin: employeePins first, the old field as the fallback, junk ignored", () => {
  assert.equal(pickPin({ pin: "1234" }, { pin: "9999" }), "1234");
  assert.equal(pickPin(undefined, { pin: "9999" }), "9999");
  assert.equal(pickPin({ pin: "12" }, { pin: "9999" }), "9999");
  assert.equal(pickPin(undefined, {}), null);
  assert.equal(pickPin(null, null), null);
});

for (const where of ["legacy", "both", "moved"]) {
  test(`every PIN reader works with the PIN ${where === "legacy" ? "only on the employee doc" : where === "both" ? "in both places" : "only in employeePins"}`, async () => {
    const c = "ep-read-" + where;
    await seed(c, "4821", where);

    // Supervisor app (live 1.1.4 and new): offline PIN table.
    const table = await call("getPinSyncTable", {}, supervisorAuth(c));
    assert.equal(table.employees.find((e) => e.id === "emp1")?.pin, "4821");

    // Supervisor app: online PIN lookup.
    const verified = await call("verifyPin", { pin: "4821" }, supervisorAuth(c));
    assert.equal(verified.matched, true);
    assert.equal(verified.employee.id, "emp1");
    assert.equal((await call("verifyPin", { pin: "1111" }, supervisorAuth(c))).matched, false);

    // Employee App: Settings > Show PIN.
    await db.doc(`pinReveals/uid-${c}`).delete();
    assert.deepEqual(await call("getMyPin", {}, employeeAuth(c)), { status: "ok", pin: "4821" });

    // Employee App: the on-phone PIN hash check.
    const v = await call("getMyPinVerifier", {}, employeeAuth(c));
    assert.equal(v.status, "ok");
    assert.equal(v.hash, phoneHash(v.salt, "4821"));

    // Website: Employees table + Edit Employee modal.
    assert.deepEqual(await call("getEmployeePins", {}, adminAuth(c)), { pins: { emp1: "4821" } });
    assert.deepEqual(await call("getEmployeePins", { employeeId: "emp1" }, adminAuth(c)), { pins: { emp1: "4821" } });
  });
}

test("a changed PIN: the old value left on the employee doc no longer works anywhere", async () => {
  const c = "ep-stale";
  await seed(c, "4821", "both");
  await pinDoc(c).set({ pin: "5555", updatedAt: admin.firestore.Timestamp.now() });
  assert.equal((await call("verifyPin", { pin: "4821" }, supervisorAuth(c))).matched, false);
  assert.equal((await call("verifyPin", { pin: "5555" }, supervisorAuth(c))).matched, true);
  const v = await call("getMyPinVerifier", {}, employeeAuth(c));
  assert.equal(v.hash, phoneHash(v.salt, "5555"));
});

test("phase i: setEmployeePin and addEmployee write employeePins AND the old field (live website)", async () => {
  const c = "ep-write-i";
  await seed(c, "4821", "legacy");
  const set = await call("setEmployeePin", { employeeId: "emp1", pin: "7302" }, adminAuth(c));
  assert.equal(set.pin, "7302");
  assert.equal((await pinDoc(c).get()).get("pin"), "7302");
  assert.equal((await empDoc(c).get()).get("pin"), "7302");
  assert.equal((await db.doc(`companies/${c}/pins/4821`).get()).exists, false, "old reservation released");

  const added = await call("addEmployee", { name: "Ben" }, adminAuth(c));
  assert.match(added.pin, /^\d{4}$/);
  assert.equal((await pinDoc(c, added.employeeId).get()).get("pin"), added.pin);
  assert.equal((await empDoc(c, added.employeeId).get()).get("pin"), added.pin);
});

test("phase ii (EMPLOYEE_DOC_PIN_REMOVED=true): new and changed PINs stay off the employee doc", async () => {
  const c = "ep-write-ii";
  await seed(c, "4821", "both");
  process.env.EMPLOYEE_DOC_PIN_REMOVED = "true";
  try {
    await call("setEmployeePin", { employeeId: "emp1", pin: "7302" }, adminAuth(c));
    assert.equal((await pinDoc(c).get()).get("pin"), "7302");
    assert.equal((await empDoc(c).get()).get("pin"), undefined, "old field removed on change");

    const added = await call("addEmployee", { name: "Ben" }, adminAuth(c));
    assert.equal((await pinDoc(c, added.employeeId).get()).get("pin"), added.pin);
    assert.equal((await empDoc(c, added.employeeId).get()).get("pin"), undefined);
  } finally {
    delete process.env.EMPLOYEE_DOC_PIN_REMOVED;
  }
});

test("getEmployeePins: admin/owner only, own company only, strict input", async () => {
  const c = "ep-auth";
  await seed(c, "4821", "both");
  await assert.rejects(call("getEmployeePins", {}, supervisorAuth(c)), /Not authorized/);
  await assert.rejects(call("getEmployeePins", {}, employeeAuth(c)), /Not authorized/);
  await assert.rejects(call("getEmployeePins", {}, null), /signed in/);
  await assert.rejects(call("getEmployeePins", { companyId: "other" }, adminAuth(c)), /Invalid/);
  // Another company's admin gets their own (empty) company, never this one.
  assert.deepEqual(await call("getEmployeePins", {}, adminAuth("ep-auth-other")), { pins: {} });
  assert.deepEqual(await call("getEmployeePins", { employeeId: "nope" }, adminAuth(c)), { pins: {} });
});

test("deleteEmployee removes the employeePins doc and the reservation", async () => {
  const c = "ep-delete";
  await seed(c, "4821", "moved");
  await empDoc(c).update({ linkedUserId: admin.firestore.FieldValue.delete() });
  await call("deleteEmployee", { employeeId: "emp1" }, adminAuth(c));
  assert.equal((await pinDoc(c).get()).exists, false);
  assert.equal((await db.doc(`companies/${c}/pins/4821`).get()).exists, false);
});
