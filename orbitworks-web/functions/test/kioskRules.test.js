// Task 5 (Kiosk mode) - firestore.rules + storage.rules for the new "kiosk"
// role. Real emulators.
// Run (from functions/):
//   firebase emulators:exec --only firestore,storage "node --test test/kioskRules.test.js"
//
// K9: deny by default. A kiosk token reads only employeeAppConfig and its own
// users doc, writes nothing in Firestore, and in Storage may only CREATE
// clock photos (never read one). It never sees pay, PII, PINs or another
// company. Also: nobody else can forge source "kiosk", set the kiosk field,
// or touch planTierChangedAt; a kiosk invite must link a record + needs Pro.
// Staff and employee access is covered (unchanged) by rules.test.js,
// employeeRules.test.js, adminPermissionsRules.test.js and
// liveClientsCompat.test.js.
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const {
  doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteDoc, collection, query, where, serverTimestamp,
} = require("firebase/firestore");
const { ref, uploadString, getBytes } = require("firebase/storage");

const A = "companyA";
const B = "companyB";
let env;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "orbitworks-kiosk-rules-test",
    firestore: { host: "127.0.0.1", port: 8090, rules: fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: fs.readFileSync(path.join(__dirname, "..", "..", "storage.rules"), "utf8") },
  });
});
test.after(async () => env.cleanup());

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const set = (p, d) => setDoc(doc(db, ...p), d);
    for (const c of [A, B]) {
      await set(["companies", c], { name: "Co " + c, planTier: "pro_tier1", subscriptionStatus: "active", employeeCap: 50, activeEmployeeCount: 2 });
      await set(["companies", c, "employeeAppConfig", "main"], { overtimeEnabled: false });
      await set(["companies", c, "employees", "emp1"], { name: "Jordan", active: true, hourlyRate: 22, pin: "1234", dob: "1990-01-01", phone: "555", email: "j@x.com" });
      await set(["companies", c, "employees", "kiosk1"], { name: "Front iPad", active: true, kiosk: true, linkedUserId: "kioskUid" + c });
      await set(["companies", c, "employeePins", "emp1"], { pin: "1234" });
      await set(["companies", c, "pins", "1234"], { employeeId: "emp1" });
      await set(["companies", c, "jobs", "laborer"], { name: "Laborer", hourlyRate: 15 });
      await set(["companies", c, "jobSites", "site1"], { name: "Yard", active: true });
      await set(["companies", c, "subcontractors", "sub1"], { name: "Sub", active: true });
      await set(["companies", c, "clockEvents", "e1"], { employeeId: "emp1", type: "in", source: "pin", createdByUid: "x" });
      await set(["companies", c, "timesheetApprovals", "e1"], { employeeId: "emp1", status: "pending" });
      await set(["companies", c, "alerts", "al1"], { companyId: c, readByDeviceIds: [] });
      await set(["companies", c, "alertActions", "aa1"], { resolvedByUid: "x" });
      await set(["companies", c, "siteExits", "x1"], { employeeId: "emp1" });
      await set(["companies", c, "shiftNotes", "n1"], { employeeId: "emp1", note: "hi" });
      await set(["companies", c, "employeeUpdates", "u1"], { employeeId: "emp1" });
      await set(["companies", c, "devices", "d1"], { name: "Gate", platform: "ios" });
      await set(["companies", c, "kioskExitKeys", "k1"], { kioskEmployeeId: "kiosk1", hash: "h", salt: "s" });
      await set(["companies", c, "kioskPinAttempts", "kiosk1"], { count: 1 });
      await set(["companies", c, "employeePinHistory", "emp1"], { pins: [] });
      await set(["companies", c, "employeeSelfViews", "emp1"], { name: "Jordan", linkedUserId: "u" });
      await set(["companies", c, "pushTokens", "dev1"], { deviceId: "dev1", token: "ExponentPushToken[x]", platform: "ios" });
      await set(["companies", c, "queueBackups", "q1"], { localId: "q1", backedUpByUid: "x" });
      await set(["companies", c, "overrideEvents", "o1"], { siteId: "site1" });
    }
    await set(["users", "kioskUidA"], { role: "kiosk", companyId: A, name: "Front iPad" });
    await set(["users", "adminUid"], { role: "admin", companyId: A, name: "Ada", email: "ada@x.com" });
  });
});

const kioskCtx = () => env.authenticatedContext("kioskUidA", { role: "kiosk", companyId: A, employeeId: "kiosk1" });
const kiosk = () => kioskCtx().firestore();
const owner = () => env.authenticatedContext("ownerUid", { role: "owner", companyId: A }).firestore();
const supervisor = () => env.authenticatedContext("supUid", { role: "supervisor", companyId: A, employeeId: "sup1" });

test("kiosk: reads employeeAppConfig + its own users doc, nothing else of its company", async () => {
  const db = kiosk();
  await assertSucceeds(getDoc(doc(db, "companies", A, "employeeAppConfig", "main")));
  await assertSucceeds(getDoc(doc(db, "users", "kioskUidA")));

  // company doc (plan, billing) + every subcollection with pay / PII / PINs / shifts
  await assertFails(getDoc(doc(db, "companies", A)));
  for (const p of [
    ["employees", "emp1"], ["employees", "kiosk1"], ["employeePins", "emp1"], ["pins", "1234"], ["jobs", "laborer"],
    ["jobSites", "site1"], ["subcontractors", "sub1"], ["clockEvents", "e1"], ["timesheetApprovals", "e1"],
    ["alerts", "al1"], ["alertActions", "aa1"], ["siteExits", "x1"], ["shiftNotes", "n1"], ["employeeUpdates", "u1"],
    ["devices", "d1"], ["kioskExitKeys", "k1"], ["kioskPinAttempts", "kiosk1"], ["employeePinHistory", "emp1"],
    ["employeeSelfViews", "emp1"], ["pushTokens", "dev1"], ["queueBackups", "q1"], ["overrideEvents", "o1"],
  ]) {
    await assertFails(getDoc(doc(db, "companies", A, ...p)), `get ${p.join("/")}`);
  }
  for (const c of ["employees", "employeePins", "jobs", "jobSites", "clockEvents", "timesheetApprovals", "alerts", "shiftNotes", "devices", "kioskExitKeys"]) {
    await assertFails(getDocs(collection(db, "companies", A, c)), `list ${c}`);
  }
  await assertFails(getDocs(query(collection(db, "companies", A, "clockEvents"), where("employeeId", "==", "emp1"))));
  await assertFails(getDoc(doc(db, "users", "adminUid")));
});

test("kiosk: nothing at all of another company", async () => {
  const db = kiosk();
  await assertFails(getDoc(doc(db, "companies", B)));
  await assertFails(getDoc(doc(db, "companies", B, "employeeAppConfig", "main")));
  await assertFails(getDoc(doc(db, "companies", B, "employees", "emp1")));
  await assertFails(getDocs(collection(db, "companies", B, "clockEvents")));
});

test("kiosk: no Firestore writes (punches go through kioskPunch)", async () => {
  const db = kiosk();
  const ev = (source) => ({
    employeeId: "emp1", employeeName: "Jordan", type: "in", source, createdByUid: "kioskUidA",
    timestamp: serverTimestamp(), siteId: "site1", siteName: "Yard",
  });
  await assertFails(setDoc(doc(db, "companies", A, "clockEvents", "k-1"), ev("kiosk")));
  await assertFails(setDoc(doc(db, "companies", A, "clockEvents", "k-2"), ev("pin")));
  await assertFails(updateDoc(doc(db, "companies", A, "clockEvents", "e1"), { note: "x" }));
  await assertFails(setDoc(doc(db, "companies", A, "devices", "d2"), { name: "Mine", platform: "ios", model: "", createdByUid: "kioskUidA", createdAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "companies", A, "devices", "d1"), { name: "Renamed" }));
  await assertFails(updateDoc(doc(db, "companies", A, "alerts", "al1"), { readByDeviceIds: ["dev1"] }));
  await assertFails(setDoc(doc(db, "companies", A, "pushTokens", "dev9"), { deviceId: "dev9", token: "ExponentPushToken[y]", platform: "ios" }));
  await assertFails(setDoc(doc(db, "companies", A, "queueBackups", "q9"), { localId: "q9", backedUpByUid: "kioskUidA" }));
  await assertFails(addDoc(collection(db, "companies", A, "shiftNotes"), { note: "x", employeeId: "emp1", createdByUid: "kioskUidA" }));
  await assertFails(updateDoc(doc(db, "companies", A, "employees", "kiosk1"), { name: "x" }));
  await assertFails(updateDoc(doc(db, "companies", A), { name: "x" }));
  await assertFails(deleteDoc(doc(db, "companies", A, "clockEvents", "e1")));
  await assertFails(setDoc(doc(db, "invites", "i9"), { companyId: A, role: "kiosk", email: "z@x.com", linkExistingEmployeeId: "emp1" }));
});

test("staff can't forge kiosk punches, the kiosk field, or planTierChangedAt", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "companies", A, "employees", "sup1"), { name: "Sam", active: true, isSupervisor: true, linkedUserId: "supUid" });
  });
  const sup = supervisor().firestore();
  const ev = (source) => ({
    employeeId: "emp1", employeeName: "Jordan", type: "in", source, createdByUid: "supUid",
    timestamp: serverTimestamp(), siteId: "site1", siteName: "Yard",
  });
  await assertSucceeds(setDoc(doc(sup, "companies", A, "clockEvents", "s-ok"), ev("pin")));
  await assertFails(setDoc(doc(sup, "companies", A, "clockEvents", "s-kiosk"), ev("kiosk")));

  const db = owner();
  await assertFails(updateDoc(doc(db, "companies", A, "employees", "emp1"), { kiosk: true }));
  await assertFails(updateDoc(doc(db, "companies", A, "employees", "kiosk1"), { kiosk: false }));
  await assertSucceeds(updateDoc(doc(db, "companies", A, "employees", "kiosk1"), { name: "Lobby iPad" }));
  await assertFails(setDoc(doc(db, "companies", A, "employees", "new1"), { name: "N", active: false, kiosk: true }));
  await assertFails(updateDoc(doc(db, "companies", A), { planTierChangedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(db, "companies", A, "kioskExitKeys", "k1")));
  await assertFails(getDoc(doc(db, "companies", A, "kioskPinAttempts", "kiosk1")));
});

test("kiosk invites: must link a record and need Pro", async () => {
  const db = owner();
  await assertSucceeds(setDoc(doc(db, "invites", "ok"), { companyId: A, role: "kiosk", email: "ipad@x.com", linkExistingEmployeeId: "emp1", status: "pending" }));
  await assertFails(setDoc(doc(db, "invites", "nolink"), { companyId: A, role: "kiosk", email: "ipad2@x.com", status: "pending" }));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "companies", A), { planTier: "core2_tier1" });
  });
  await assertFails(setDoc(doc(db, "invites", "core"), { companyId: A, role: "kiosk", email: "ipad3@x.com", linkExistingEmployeeId: "emp1", status: "pending" }));
  // supervisor / admin invites unchanged on Core
  await assertSucceeds(setDoc(doc(db, "invites", "sup"), { companyId: A, role: "supervisor", email: "s@x.com", status: "pending" }));
});

// ===================== Storage =====================

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const put = (ctx, p, customMetadata) =>
  uploadString(ref(ctx.storage(), p), JPEG, "data_url", { contentType: "image/jpeg", ...(customMetadata ? { customMetadata } : {}) });

test("STORAGE kiosk: creates clock photos (stamped with its uid), never reads any", async () => {
  const ctx = kioskCtx();
  const p = `companies/${A}/clockEvents/emp1/11111111-1111-4111-8111-111111111111.jpg`;
  await assertSucceeds(put(ctx, p, { kioskUid: "kioskUidA" }));
  // a retry of its own upload is fine
  await assertSucceeds(put(ctx, p, { kioskUid: "kioskUidA" }));
  await assertFails(getBytes(ref(ctx.storage(), p)));
  // no stamp / someone else's stamp
  await assertFails(put(ctx, `companies/${A}/clockEvents/emp1/b.jpg`));
  await assertFails(put(ctx, `companies/${A}/clockEvents/emp1/c.jpg`, { kioskUid: "other" }));
  // never overwrite a photo it didn't upload
  await env.withSecurityRulesDisabled(async (admin) => {
    await uploadString(ref(admin.storage(), `companies/${A}/clockEvents/emp1/sup.jpg`), JPEG, "data_url", { contentType: "image/jpeg" });
  });
  await assertFails(put(ctx, `companies/${A}/clockEvents/emp1/sup.jpg`, { kioskUid: "kioskUidA" }));
  // not an image
  await assertFails(uploadString(ref(ctx.storage(), `companies/${A}/clockEvents/emp1/d.jpg`), "hello", "raw", { contentType: "text/plain", customMetadata: { kioskUid: "kioskUidA" } }));
});

test("STORAGE kiosk: nothing else company-wide, nothing of another company", async () => {
  const ctx = kioskCtx();
  await env.withSecurityRulesDisabled(async (admin) => {
    await uploadString(ref(admin.storage(), `companies/${A}/employees/emp1/reference.jpg`), JPEG, "data_url", { contentType: "image/jpeg" });
    await uploadString(ref(admin.storage(), `companies/${A}/logo.jpg`), JPEG, "data_url", { contentType: "image/jpeg" });
  });
  await assertFails(getBytes(ref(ctx.storage(), `companies/${A}/employees/emp1/reference.jpg`)));
  await assertFails(getBytes(ref(ctx.storage(), `companies/${A}/logo.jpg`)));
  await assertFails(put(ctx, `companies/${A}/employees/emp1/reference.jpg`, { kioskUid: "kioskUidA" }));
  await assertFails(put(ctx, `companies/${A}/logo.jpg`, { kioskUid: "kioskUidA" }));
  await assertFails(put(ctx, `companies/${B}/clockEvents/emp1/x.jpg`, { kioskUid: "kioskUidA" }));
  // staff unchanged
  const sup = supervisor();
  await assertSucceeds(getBytes(ref(sup.storage(), `companies/${A}/logo.jpg`)));
});
