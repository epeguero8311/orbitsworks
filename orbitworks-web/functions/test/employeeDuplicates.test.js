// Phase 9 - dismissDuplicateFlag through the REAL callable on the
// Firestore emulator. Each test uses its own company.
// Run: firebase emulators:exec --only firestore "node --test test/employeeDuplicates.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-dup-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { db } = require("../lib/shared.js");
const funcs = require("../lib/index.js");

const auth = (c, role = "admin", uid = "uidAdmin") => ({ uid, token: { role, companyId: c } });
const call = (c, data, a = auth(c)) => funcs.dismissDuplicateFlag.run({ data, auth: a, rawRequest: {} });
const emp = (c, id) => db.doc(`companies/${c}/employees/${id}`);

async function seed(c) {
  await db.doc(`users/uidAdmin`).set({ name: "Ada Admin", role: "admin", companyId: c });
  await emp(c, "old").set({ name: "Ana Ruiz", dob: "1990-01-02", active: true });
  await emp(c, "new").set({
    name: "Ana Ruiz",
    dob: "1990-01-02",
    active: true,
    pin: "1234",
    possibleDuplicateOf: ["old"],
    duplicateFlaggedAt: admin.firestore.Timestamp.fromMillis(1000),
  });
}

test("admin dismisses: flag removed, audit kept, the other employee untouched", async () => {
  const c = "dup-ok";
  await seed(c);
  assert.deepEqual(await call(c, { employeeId: "new" }), { ok: true, dismissed: true });
  const d = (await emp(c, "new").get()).data();
  assert.equal(d.possibleDuplicateOf, undefined);
  assert.equal(d.duplicateFlaggedAt, undefined);
  assert.deepEqual(d.dismissedDuplicateOf, ["old"]);
  assert.equal(d.duplicateDismissedByUid, "uidAdmin");
  assert.equal(d.duplicateDismissedByName, "Ada Admin");
  assert.ok(d.duplicateDismissedAt);
  assert.equal(d.pin, "1234");
  assert.equal(d.active, true);
  assert.deepEqual(Object.keys((await emp(c, "old").get()).data()).sort(), ["active", "dob", "name"]);
});

test("owner may dismiss too; a second dismiss changes nothing", async () => {
  const c = "dup-owner";
  await seed(c);
  assert.equal((await call(c, { employeeId: "new" }, auth(c, "owner", "uidOwner"))).dismissed, true);
  assert.equal((await call(c, { employeeId: "new" })).dismissed, false);
  assert.equal((await emp(c, "new").get()).data().duplicateDismissedByUid, "uidOwner");
});

test("supervisor, employee, signed out, another company, bad input and missing employee are refused", async () => {
  const c = "dup-refuse";
  await seed(c);
  await assert.rejects(call(c, { employeeId: "new" }, auth(c, "supervisor")), /Not authorized/);
  await assert.rejects(call(c, { employeeId: "new" }, auth(c, "employee")), /Not authorized/);
  await assert.rejects(funcs.dismissDuplicateFlag.run({ data: { employeeId: "new" }, auth: null, rawRequest: {} }), /signed in/);
  await assert.rejects(call("other-co", { employeeId: "new" }), /not found/i);
  await assert.rejects(call(c, { employeeId: "bad id" }), /Invalid employee/);
  await assert.rejects(call(c, { employeeId: "new", companyId: c }), /Invalid employee/);
  assert.deepEqual((await emp(c, "new").get()).data().possibleDuplicateOf, ["old"]);
});
