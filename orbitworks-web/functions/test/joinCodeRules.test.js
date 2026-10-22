// Employee App (Phase 1) - Firestore rules tests for join codes (server-only
// for every role) and subcontractors (admin/owner write, same company only,
// never hard-deleted). Runs against the real Firestore emulator.
//
// Usage (from functions/):
//   firebase emulators:exec --only firestore,storage "node --test test/joinCodeRules.test.js"
// Port must match firebase.json's emulators block.
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
} = require("firebase/firestore");

const A = "companyA";
const B = "companyB";

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "orbitworks-joincode-rules-test",
    firestore: {
      host: "127.0.0.1",
      port: 8090,
      rules: fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8"),
    },
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const set = (p, data) => setDoc(doc(db, ...p), data);
    await set(["companies", A], { name: "Company A", planTier: "pro_tier1" });
    await set(["companies", B], { name: "Company B", planTier: "pro_tier1" });
    await set(["companies", A, "employees", "empA"], { name: "Ana", active: true, linkedUserId: "uidA", appAccess: true });
    await set(["companies", A, "employees", "sup1"], { name: "Sam", active: true, isSupervisor: true, linkedUserId: "uidSup" });
    await set(["companies", A, "subcontractors", "sub1"], { name: "Sub Co", active: true });
    await set(["companies", B, "subcontractors", "subX"], { name: "B Sub", active: true });
    await set(["joinCodes", "tokA"], { codeId: "c1", companyId: A, siteId: "site1", status: "active" });
    await set(["joinCodes", "tokB"], { codeId: "c2", companyId: B, siteId: "siteX", status: "active" });
  });
});

const ctx = {
  owner: () => testEnv.authenticatedContext("uidOwner", { role: "owner", companyId: A }),
  admin: () => testEnv.authenticatedContext("uidAdmin", { role: "admin", companyId: A }),
  supervisor: () => testEnv.authenticatedContext("uidSup", { role: "supervisor", companyId: A, employeeId: "sup1" }),
  employee: () => testEnv.authenticatedContext("uidA", { role: "employee", companyId: A, employeeId: "empA" }),
  signedOut: () => testEnv.unauthenticatedContext(),
};

// ---- joinCodes: denied to every client, every operation ----

for (const [role, make] of Object.entries(ctx)) {
  test(`FAIL: ${role} reads, lists, queries, creates, updates or deletes a join code`, async () => {
    const db = make().firestore();
    await assertFails(getDoc(doc(db, "joinCodes", "tokA")));
    await assertFails(getDoc(doc(db, "joinCodes", "tokB")));
    await assertFails(getDocs(collection(db, "joinCodes")));
    await assertFails(getDocs(query(collection(db, "joinCodes"), where("companyId", "==", A))));
    await assertFails(setDoc(doc(db, "joinCodes", "tokNew"), { codeId: "c9", companyId: A, status: "active" }));
    await assertFails(addDoc(collection(db, "joinCodes"), { companyId: A }));
    await assertFails(updateDoc(doc(db, "joinCodes", "tokA"), { status: "revoked" }));
    await assertFails(updateDoc(doc(db, "joinCodes", "tokA"), { joinedCount: 0 }));
    await assertFails(deleteDoc(doc(db, "joinCodes", "tokA")));
  });
}

// ---- subcontractors ----

for (const role of ["admin", "owner"]) {
  test(`PASS: ${role} adds, renames and deactivates a subcontractor in their company`, async () => {
    const db = ctx[role]().firestore();
    await assertSucceeds(getDocs(collection(db, "companies", A, "subcontractors")));
    await assertSucceeds(setDoc(doc(db, "companies", A, "subcontractors", "sub2"), { name: "New Sub", active: true }));
    await assertSucceeds(updateDoc(doc(db, "companies", A, "subcontractors", "sub1"), { name: "Renamed Sub" }));
    await assertSucceeds(updateDoc(doc(db, "companies", A, "subcontractors", "sub1"), { active: false }));
  });

  test(`FAIL: ${role} hard-deletes a subcontractor`, async () => {
    const db = ctx[role]().firestore();
    await assertFails(deleteDoc(doc(db, "companies", A, "subcontractors", "sub1")));
  });

  test(`FAIL: ${role} reads or writes another company's subcontractors`, async () => {
    const db = ctx[role]().firestore();
    await assertFails(getDoc(doc(db, "companies", B, "subcontractors", "subX")));
    await assertFails(setDoc(doc(db, "companies", B, "subcontractors", "subY"), { name: "Sneaky", active: true }));
    await assertFails(updateDoc(doc(db, "companies", B, "subcontractors", "subX"), { active: false }));
  });
}

test("PASS: supervisor reads subcontractors (needed for clock-in) but can't write", async () => {
  const db = ctx.supervisor().firestore();
  await assertSucceeds(getDoc(doc(db, "companies", A, "subcontractors", "sub1")));
  await assertFails(setDoc(doc(db, "companies", A, "subcontractors", "sub2"), { name: "x", active: true }));
  await assertFails(updateDoc(doc(db, "companies", A, "subcontractors", "sub1"), { name: "x" }));
  await assertFails(deleteDoc(doc(db, "companies", A, "subcontractors", "sub1")));
});

test("FAIL: employee reads or writes subcontractors", async () => {
  const db = ctx.employee().firestore();
  await assertFails(getDoc(doc(db, "companies", A, "subcontractors", "sub1")));
  await assertFails(setDoc(doc(db, "companies", A, "subcontractors", "sub2"), { name: "x", active: true }));
  await assertFails(updateDoc(doc(db, "companies", A, "subcontractors", "sub1"), { active: false }));
  await assertFails(deleteDoc(doc(db, "companies", A, "subcontractors", "sub1")));
});

test("FAIL: signed-out user reads or writes subcontractors", async () => {
  const db = ctx.signedOut().firestore();
  await assertFails(getDoc(doc(db, "companies", A, "subcontractors", "sub1")));
  await assertFails(setDoc(doc(db, "companies", A, "subcontractors", "sub2"), { name: "x", active: true }));
});
