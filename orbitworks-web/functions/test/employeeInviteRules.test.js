// Employee App Phase 3B - Firestore rules for email invites
// (employeeInvites/{token}: admin/owner read own company only, no client
// writes at all) and the new server-only employee field employeeInviteId.
// Runs against the real Firestore emulator.
//
// Usage (from functions/):
//   firebase emulators:exec --only firestore,storage "node --test test/employeeInviteRules.test.js"
// Port must match firebase.json's emulators block.
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, collection, query, where } = require("firebase/firestore");

const A = "companyA";
const B = "companyB";
const TOK_A = "tokA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOK_B = "tokB_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "orbitworks-employeeinvite-rules-test",
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

function invite(companyId, inviteId) {
  return {
    inviteId,
    companyId,
    kind: "newPerson",
    email: "new@example.com",
    employeeId: null,
    employeeName: null,
    siteId: null,
    status: "pending",
    invitedByUid: "uidAdmin",
    emailStatus: "sent",
    resendCount: 0,
  };
}

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const set = (p, data) => setDoc(doc(db, ...p), data);
    await set(["companies", A], { name: "Company A", planTier: "core2_tier1", employeeCap: 15, activeEmployeeCount: 1, totalEmployeeCap: 20, totalEmployeeCount: 1 });
    await set(["companies", B], { name: "Company B", planTier: "pro_tier1" });
    await set(["companies", A, "employees", "empA"], { name: "Ana", active: true, linkedUserId: "uidA", appAccess: true });
    await set(["companies", A, "employees", "sup1"], { name: "Sam", active: true, isSupervisor: true, linkedUserId: "uidSup" });
    await set(["companies", A, "employees", "plain"], { name: "Pat", active: true });
    await set(["employeeInvites", TOK_A], invite(A, "invA"));
    await set(["employeeInvites", TOK_B], invite(B, "invB"));
  });
});

const ctx = {
  owner: () => testEnv.authenticatedContext("uidOwner", { role: "owner", companyId: A }),
  admin: () => testEnv.authenticatedContext("uidAdmin", { role: "admin", companyId: A }),
  supervisor: () => testEnv.authenticatedContext("uidSup", { role: "supervisor", companyId: A, employeeId: "sup1" }),
  employee: () => testEnv.authenticatedContext("uidA", { role: "employee", companyId: A, employeeId: "empA" }),
  signedOut: () => testEnv.unauthenticatedContext(),
};

// ---- reads ----

for (const role of ["owner", "admin"]) {
  test(`OK: ${role} reads own company's invite and lists them filtered by companyId`, async () => {
    const db = ctx[role]().firestore();
    await assertSucceeds(getDoc(doc(db, "employeeInvites", TOK_A)));
    await assertSucceeds(getDocs(query(collection(db, "employeeInvites"), where("companyId", "==", A))));
  });

  test(`FAIL: ${role} reads another company's invite, lists unfiltered or by the other company`, async () => {
    const db = ctx[role]().firestore();
    await assertFails(getDoc(doc(db, "employeeInvites", TOK_B)));
    await assertFails(getDocs(collection(db, "employeeInvites")));
    await assertFails(getDocs(query(collection(db, "employeeInvites"), where("companyId", "==", B))));
    await assertFails(getDocs(query(collection(db, "employeeInvites"), where("email", "==", "new@example.com"))));
  });
}

for (const role of ["supervisor", "employee", "signedOut"]) {
  test(`FAIL: ${role} reads, lists or queries any invite`, async () => {
    const db = ctx[role]().firestore();
    await assertFails(getDoc(doc(db, "employeeInvites", TOK_A)));
    await assertFails(getDoc(doc(db, "employeeInvites", TOK_B)));
    await assertFails(getDocs(collection(db, "employeeInvites")));
    await assertFails(getDocs(query(collection(db, "employeeInvites"), where("companyId", "==", A))));
  });
}

test("FAIL: admin reads an invite doc that has no companyId field", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const { companyId: _drop, ...rest } = invite(A, "invNoCo");
    await setDoc(doc(context.firestore(), "employeeInvites", "tokNoCo_ddddddddddddddddddddddddddddddddddd"), rest);
  });
  const db = ctx.admin().firestore();
  await assertFails(getDoc(doc(db, "employeeInvites", "tokNoCo_ddddddddddddddddddddddddddddddddddd")));
});

test("FAIL: admin with no companyId claim reads an invite", async () => {
  const db = testEnv.authenticatedContext("uidX", { role: "admin" }).firestore();
  await assertFails(getDoc(doc(db, "employeeInvites", TOK_A)));
});

// ---- writes: denied to every client ----

for (const [role, make] of Object.entries(ctx)) {
  test(`FAIL: ${role} creates, updates (accept / revoke / un-expire) or deletes an invite`, async () => {
    const db = make().firestore();
    await assertFails(setDoc(doc(db, "employeeInvites", "tokNew_cccccccccccccccccccccccccccccccccccc"), invite(A, "invNew")));
    await assertFails(addDoc(collection(db, "employeeInvites"), invite(A, "invNew2")));
    await assertFails(updateDoc(doc(db, "employeeInvites", TOK_A), { status: "accepted", acceptedByUid: "uidX" }));
    await assertFails(updateDoc(doc(db, "employeeInvites", TOK_A), { status: "revoked" }));
    await assertFails(updateDoc(doc(db, "employeeInvites", TOK_A), { emailStatus: "sent" }));
    await assertFails(setDoc(doc(db, "employeeInvites", TOK_A), { ...invite(A, "invA"), email: "attacker@example.com" }));
    await assertFails(deleteDoc(doc(db, "employeeInvites", TOK_A)));
    await assertFails(deleteDoc(doc(db, "employeeInvites", TOK_B)));
  });
}

// ---- employee doc: employeeInviteId is server-only ----

test("FAIL: admin sets employeeInviteId on create or update of an employee", async () => {
  const db = ctx.admin().firestore();
  await assertFails(setDoc(doc(db, "companies", A, "employees", "newRow"), { name: "New", active: false, employeeInviteId: "invA" }));
  await assertFails(updateDoc(doc(db, "companies", A, "employees", "plain"), { employeeInviteId: "invA" }));
});

test("OK: admin still creates and edits employees without the field (no regression)", async () => {
  const db = ctx.admin().firestore();
  await assertSucceeds(setDoc(doc(db, "companies", A, "employees", "newRow"), { name: "New", active: false }));
  await assertSucceeds(updateDoc(doc(db, "companies", A, "employees", "plain"), { name: "Pat Two" }));
});

test("FAIL: employee writes employeeInviteId (or anything) on their own row", async () => {
  const db = ctx.employee().firestore();
  await assertFails(updateDoc(doc(db, "companies", A, "employees", "empA"), { employeeInviteId: "invA" }));
});
