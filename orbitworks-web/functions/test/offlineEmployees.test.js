// Offline employee create/update sync: duplicate-PIN replacement (create and
// PIN edit), the pinChanged alert, admin-only PIN edits, and last-edit-wins
// by edit time. Runs the real compiled callables (lib/) against the
// Firestore emulator via their exported .run(request), same convention as
// alerts.test.js.
process.env.GCLOUD_PROJECT = "orbitworks-func-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

const funcs = require("../lib/index.js");
const { db } = require("../lib/shared.js");

const COMPANY = "co-offline-emp";
const ADMIN_UID = "admin-uid";

// Clears whichever project the admin SDK actually writes to - under
// `firebase emulators:exec`, FIREBASE_CONFIG's projectId wins over
// GCLOUD_PROJECT.
async function clearFirestore() {
  const projectId = admin.app().options.projectId || process.env.GCLOUD_PROJECT;
  await fetch(
    `http://localhost:8090/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" }
  );
}

function auth(role, uid = ADMIN_UID) {
  return { uid, token: { role, companyId: COMPANY } };
}

const companyRef = () => db.collection("companies").doc(COMPANY);

async function seedEmployee(id, fields) {
  await companyRef().collection("employees").doc(id).set({ name: id, active: true, ...fields });
  if (fields.pin) {
    await companyRef().collection("pins").doc(fields.pin).set({ employeeId: id });
  }
}

async function alertsOfType(type) {
  const snap = await companyRef().collection("alerts").where("alertType", "==", type).get();
  return snap.docs.map((d) => d.data());
}

test.beforeEach(async () => {
  await clearFirestore();
  await companyRef().set({ appSettings: {}, activeEmployeeCount: 1, totalEmployeeCount: 1 });
});

test("create: offline PIN already taken -> new unique PIN, pinChanged alert, client createdAt kept", async () => {
  await seedEmployee("existing", { pin: "4826" });
  const employeeId = "newEmployeeId0001";
  const createdAtMs = Date.now() - 60 * 60 * 1000;

  const result = await funcs.createEmployee.run({
    auth: auth("supervisor"),
    data: {
      employeeId,
      name: "Dana Cruz",
      photoUrl: `https://x/${encodeURIComponent(`companies/${COMPANY}/employees/${employeeId}/reference.jpg`)}`,
      clientPin: "4826",
      clientCreatedAt: createdAtMs,
    },
  });

  assert.equal(result.pinChanged, true);
  assert.notEqual(result.pin, "4826");
  assert.match(result.pin, /^\d{4}$/);

  const emp = (await companyRef().collection("employees").doc(employeeId).get()).data();
  assert.equal(emp.pin, result.pin);
  assert.equal(emp.createdAt.toMillis(), createdAtMs);
  const pinDoc = (await companyRef().collection("pins").doc(result.pin).get()).data();
  assert.equal(pinDoc.employeeId, employeeId);

  const alerts = await alertsOfType("pinChanged");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].message, `Offline PIN for Dana Cruz was a duplicate and changed to ${result.pin}`);
});

test("update: admin PIN edit to a taken PIN -> replaced, old PIN released, alert written", async () => {
  await seedEmployee("taker", { pin: "1357" });
  await seedEmployee("emp1aaaaaaaa", { pin: "2468" });

  const result = await funcs.updateEmployeeProfile.run({
    auth: auth("admin"),
    data: { employeeId: "emp1aaaaaaaa", updateId: "update00000001", pin: "1357", clientEditedAt: Date.now() - 1000 },
  });

  assert.equal(result.pinChanged, true);
  assert.notEqual(result.pin, "1357");
  const emp = (await companyRef().collection("employees").doc("emp1aaaaaaaa").get()).data();
  assert.equal(emp.pin, result.pin);
  assert.equal((await companyRef().collection("pins").doc("2468").get()).exists, false);
  assert.equal((await companyRef().collection("pins").doc("1357").get()).data().employeeId, "taker");
  assert.equal((await alertsOfType("pinChanged")).length, 1);

  // Retry of the same edit: same PIN back, nothing reserved again.
  const again = await funcs.updateEmployeeProfile.run({
    auth: auth("admin"),
    data: { employeeId: "emp1aaaaaaaa", updateId: "update00000001", pin: "1357" },
  });
  assert.equal(again.pin, result.pin);
  const pinsHeld = await companyRef().collection("pins").where("employeeId", "==", "emp1aaaaaaaa").get();
  assert.equal(pinsHeld.size, 1);
});

test("update: free PIN is kept as-is, no alert", async () => {
  await seedEmployee("emp2aaaaaaaa", { pin: "2468" });
  const result = await funcs.updateEmployeeProfile.run({
    auth: auth("owner"),
    data: { employeeId: "emp2aaaaaaaa", updateId: "update00000002", pin: "9173" },
  });
  assert.equal(result.pin, "9173");
  assert.equal(result.pinChanged, false);
  assert.equal((await alertsOfType("pinChanged")).length, 0);
});

// Phase 5 (Q6 A): the old PIN's end time is when the change landed on the
// server, not the phone's earlier edit time.
test("update: offline PIN edit keeps the old PIN in history until the server time it landed", async () => {
  const setMs = Date.now() - 60 * 60 * 1000;
  await seedEmployee("emp5aaaaaaaa", { pin: "2468", fieldEditedAt: { pin: admin.firestore.Timestamp.fromMillis(setMs) } });
  const before = Date.now();
  await funcs.updateEmployeeProfile.run({
    auth: auth("admin"),
    data: { employeeId: "emp5aaaaaaaa", updateId: "update00000009", pin: "9173", clientEditedAt: Date.now() - 10 * 60 * 1000 },
  });
  const hist = (await companyRef().collection("employeePinHistory").doc("emp5aaaaaaaa").get()).data();
  assert.equal(hist.entries.length, 1);
  assert.equal(hist.entries[0].fromMs, setMs);
  assert.ok(hist.entries[0].untilMs >= before && hist.entries[0].untilMs <= Date.now());
  assert.ok(!JSON.stringify(hist).includes("2468"));
});

test("update: supervisors can't change PINs", async () => {
  await seedEmployee("emp3aaaaaaaa", { pin: "2468" });
  await assert.rejects(
    funcs.updateEmployeeProfile.run({
      auth: auth("supervisor"),
      data: { employeeId: "emp3aaaaaaaa", updateId: "update00000003", pin: "9173" },
    }),
    (err) => err.code === "permission-denied"
  );
});

test("update: last edit wins by edit time, not sync time", async () => {
  const webEditMs = Date.now() - 10 * 60 * 1000;
  await seedEmployee("emp4aaaaaaaa", {
    pin: "2468",
    name: "Web Name",
    fieldEditedAt: { name: admin.firestore.Timestamp.fromMillis(webEditMs) },
  });

  // Phone edit made BEFORE the web edit, syncing now: skipped.
  const older = await funcs.updateEmployeeProfile.run({
    auth: auth("supervisor"),
    data: { employeeId: "emp4aaaaaaaa", updateId: "update00000004", name: "Phone Name", clientEditedAt: webEditMs - 60000 },
  });
  assert.deepEqual(older.skippedFields, ["name"]);
  let emp = (await companyRef().collection("employees").doc("emp4aaaaaaaa").get()).data();
  assert.equal(emp.name, "Web Name");

  // Phone edit made AFTER the web edit: applied.
  const newer = await funcs.updateEmployeeProfile.run({
    auth: auth("supervisor"),
    data: { employeeId: "emp4aaaaaaaa", updateId: "update00000005", name: "Phone Name", clientEditedAt: webEditMs + 60000 },
  });
  assert.deepEqual(newer.skippedFields, []);
  emp = (await companyRef().collection("employees").doc("emp4aaaaaaaa").get()).data();
  assert.equal(emp.name, "Phone Name");
  assert.equal(emp.fieldEditedAt.name.toMillis(), webEditMs + 60000);
});
