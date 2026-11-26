// Task 6 (update banner) - firestore.rules: appConfig/versions (signed-in
// read, no client writes) and the supervisor app's appVersion/appPlatform on
// its own punches (valid shape, write-once). Devices: a client can't set the
// version fields (server-written). Real emulator.
// Run (from functions/):
//   firebase emulators:exec --only firestore "node --test test/appVersionsRules.test.js"
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, setDoc, getDoc, updateDoc } = require("firebase/firestore");

const A = "companyA";
let env;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "orbitworks-appversions-rules-test",
    firestore: { host: "127.0.0.1", port: 8090, rules: fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8") },
  });
});
test.after(async () => env.cleanup());

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "appConfig", "versions"), { ios: { latest: "1.1.7" }, android: { latest: "1.1.7" } });
    await setDoc(doc(db, "companies", A), { name: "Co", planTier: "pro_tier1", subscriptionStatus: "active" });
    await setDoc(doc(db, "companies", A, "employees", "sup1"), { name: "Sue", active: true, isSupervisor: true });
    await setDoc(doc(db, "companies", A, "employees", "emp1"), { name: "Ana", active: true });
    await setDoc(doc(db, "companies", A, "devices", "d1"), { name: "Gate", platform: "ios", locked: false });
    await setDoc(doc(db, "companies", A, "clockEvents", "old"), { employeeId: "emp1", type: "in", source: "pin", createdByUid: "supUid", appVersion: "1.1.6", appPlatform: "ios" });
  });
});

const sup = () => env.authenticatedContext("supUid", { role: "supervisor", companyId: A, employeeId: "sup1" }).firestore();
const ev = (extra) => ({ employeeId: "emp1", employeeName: "Ana", type: "in", source: "pin", createdByUid: "supUid", siteId: null, siteName: "Not specified", ...extra });

test("appConfig/versions: every signed-in role reads; signed-out can't; nobody writes", async () => {
  for (const token of [{ role: "employee", companyId: A, employeeId: "emp1" }, { role: "supervisor", companyId: A }, { role: "owner", companyId: A }, { role: "kiosk", companyId: A }]) {
    const db = env.authenticatedContext("u-" + token.role, token).firestore();
    await assertSucceeds(getDoc(doc(db, "appConfig", "versions")));
    await assertFails(setDoc(doc(db, "appConfig", "versions"), { ios: { latest: "9.9.9" } }));
    await assertFails(updateDoc(doc(db, "appConfig", "versions"), { "ios.min": "1.1.6" }));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "appConfig", "versions")));
});

test("supervisor punch: appVersion/appPlatform optional, valid shape only", async () => {
  await assertSucceeds(setDoc(doc(sup(), "companies", A, "clockEvents", "a1"), ev({})));
  await assertSucceeds(setDoc(doc(sup(), "companies", A, "clockEvents", "a2"), ev({ appVersion: "1.1.6", appPlatform: "ios" })));
  await assertFails(setDoc(doc(sup(), "companies", A, "clockEvents", "a3"), ev({ appVersion: "1.1.6; drop", appPlatform: "ios" })));
  await assertFails(setDoc(doc(sup(), "companies", A, "clockEvents", "a4"), ev({ appVersion: 116 })));
  await assertFails(setDoc(doc(sup(), "companies", A, "clockEvents", "a5"), ev({ appVersion: "1.1.6", appPlatform: "web" })));
});

test("the version on a punch is write-once; a device's version is server-only", async () => {
  await assertFails(updateDoc(doc(sup(), "companies", A, "clockEvents", "old"), { appVersion: "9.9.9" }));
  await assertFails(updateDoc(doc(sup(), "companies", A, "devices", "d1"), { appVersion: "9.9.9" }));
  const owner = env.authenticatedContext("own", { role: "owner", companyId: A }).firestore();
  await assertFails(updateDoc(doc(owner, "companies", A, "devices", "d1"), { appVersion: "9.9.9", appPlatform: "ios" }));
  await assertSucceeds(updateDoc(doc(owner, "companies", A, "devices", "d1"), { name: "Front gate" }));
});
