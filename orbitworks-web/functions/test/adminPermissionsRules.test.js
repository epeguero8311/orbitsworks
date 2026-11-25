// Task 4 (Admin Permissions) - firestore.rules. Real Firestore emulator.
// Run (from functions/): firebase emulators:exec --only firestore "node --test test/adminPermissionsRules.test.js"
//
// Covers: a restricted admin can't read shift data directly or write it;
// permissions gate the plain client writes (jobs, employees, company
// settings, job sites, subcontractors, invites); invites can't carry access
// (G2); users docs (where access lives) can't be written by anyone; legacy
// admins (no access claims) keep everything; and G1 - the supervisor-app and
// employee-app reads/writes are unchanged.
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { setDoc, doc, updateDoc, getDoc, deleteDoc, collection, getDocs, query, where, addDoc } = require("firebase/firestore");

const A = "companyA";
let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "orbitworks-admin-perms-test",
    firestore: {
      host: "localhost",
      port: 8090,
      rules: fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8"),
    },
  });
});
test.after(async () => testEnv.cleanup());

const ALL_PERMS = ["ah", "em", "pay", "exp", "an", "bil", "set", "inv"];

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const set = (p, d) => setDoc(doc(db, ...p), d);
    await set(["companies", A], { name: "Company A", planTier: "pro_tier1" });
    await set(["companies", A, "employees", "emp1"], { name: "Jordan", active: true, assignedSiteIds: [] });
    await set(["companies", A, "employees", "sup-emp"], { name: "Sam", active: true, isSupervisor: true, assignedSiteIds: [] });
    await set(["companies", A, "employees", "selfEmp"], { name: "Eve", active: true, linkedUserId: "uidEmp", assignedSiteIds: [] });
    await set(["companies", A, "clockEvents", "inA"], { employeeId: "emp1", siteId: "siteA", type: "in", createdByUid: "x" });
    await set(["companies", A, "clockEvents", "inC"], { employeeId: "emp1", siteId: "siteC", type: "in", createdByUid: "x" });
    await set(["companies", A, "clockEvents", "eveIn"], { employeeId: "selfEmp", siteId: "siteA", type: "in", createdByUid: "x" });
    await set(["companies", A, "timesheetApprovals", "inA"], { employeeId: "emp1", siteId: "siteA", status: "pending" });
    await set(["companies", A, "timesheetApprovals", "inA", "tipEdits", "t1"], { companyId: A, amountCents: 100 });
    await set(["companies", A, "siteExits", "x1"], { employeeId: "emp1", clockInEventId: "inA" });
    await set(["companies", A, "shiftNotes", "n1"], { employeeId: "emp1", note: "hi" });
    await set(["companies", A, "overrideEvents", "o1"], { siteId: "siteA" });
    await set(["companies", A, "alerts", "al1"], { companyId: A, siteId: "siteC", readByDeviceIds: [] });
    await set(["companies", A, "jobs", "laborer"], { name: "Laborer", hourlyRate: 15, active: true });
    await set(["companies", A, "jobSites", "siteA"], { name: "Site A", active: true });
    await set(["users", "uidTarget"], { role: "admin", companyId: A });
  });
});

const ctxFor = (uid, claims) => testEnv.authenticatedContext(uid, { companyId: A, ...claims });
const owner = () => ctxFor("uidOwner", { role: "owner" }).firestore();
const legacyAdmin = () => ctxFor("uidLegacy", { role: "admin" }).firestore();
const fullAdmin = () => ctxFor("uidFull", { role: "admin", lvl: "full", allSites: true, perms: ALL_PERMS }).firestore();
const allSitesAdmin = (perms = []) => ctxFor("uidAll", { role: "admin", lvl: "admin", allSites: true, perms }).firestore();
const restricted = (perms = ALL_PERMS.filter((p) => p !== "bil"), extra = {}) =>
  ctxFor("uidR", { role: "admin", lvl: "admin", allSites: false, perms, ...extra }).firestore();
const supervisor = () => ctxFor("uidSup", { role: "supervisor", employeeId: "sup-emp" }).firestore();
const employee = () => ctxFor("uidEmp", { role: "employee", employeeId: "selfEmp" }).firestore();

const ref = (db, ...p) => doc(db, "companies", A, ...p);

test("restricted admin: no direct reads of shift data (any site)", async () => {
  const db = restricted();
  await assertFails(getDoc(ref(db, "clockEvents", "inA")));
  await assertFails(getDoc(ref(db, "clockEvents", "inC")));
  await assertFails(getDocs(collection(db, "companies", A, "clockEvents")));
  await assertFails(getDoc(ref(db, "timesheetApprovals", "inA")));
  await assertFails(getDocs(collection(db, "companies", A, "timesheetApprovals")));
  await assertFails(getDocs(collection(db, "companies", A, "timesheetApprovals", "inA", "tipEdits")));
  await assertFails(getDocs(collection(db, "companies", A, "siteExits")));
  await assertFails(getDocs(collection(db, "companies", A, "shiftNotes")));
  await assertFails(getDoc(ref(db, "overrideEvents", "o1")));
});

test("restricted admin: can't write shift data directly (approve/edit go through the server)", async () => {
  const db = restricted();
  await assertFails(
    setDoc(ref(db, "clockEvents", "new1"), { employeeId: "emp1", siteId: "siteA", type: "in", source: "adminManual", createdByUid: "uidR", timestamp: new Date() })
  );
  await assertFails(updateDoc(ref(db, "clockEvents", "inA"), { note: "x" }));
  await assertFails(deleteDoc(ref(db, "clockEvents", "inA")));
  await assertFails(updateDoc(ref(db, "timesheetApprovals", "inA"), { status: "approved" }));
  await assertFails(setDoc(ref(db, "shiftNotes", "n2"), { employeeId: "emp1", note: "x" }));
});

test("restricted admin who is also a supervisor keeps supervisor-level reads (G1 sub A)", async () => {
  const db = restricted([], { sup: true, employeeId: "sup-emp" });
  await assertSucceeds(getDocs(collection(db, "companies", A, "clockEvents")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "shiftNotes")));
  // ...but still not the admin-only approval data.
  await assertFails(getDocs(collection(db, "companies", A, "timesheetApprovals")));
});

test("restricted admin still gets every alert (rule 4) and the company doc / employees / sites", async () => {
  const db = restricted([]);
  await assertSucceeds(getDocs(collection(db, "companies", A, "alerts")));
  await assertSucceeds(getDoc(doc(db, "companies", A)));
  await assertSucceeds(getDocs(collection(db, "companies", A, "employees")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "jobSites")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "jobs")));
});

test("all-sites admins, Full access, owner and legacy admins keep direct reads", async () => {
  for (const db of [owner(), legacyAdmin(), fullAdmin(), allSitesAdmin()]) {
    await assertSucceeds(getDocs(collection(db, "companies", A, "clockEvents")));
    await assertSucceeds(getDocs(collection(db, "companies", A, "timesheetApprovals")));
    await assertSucceeds(getDocs(collection(db, "companies", A, "timesheetApprovals", "inA", "tipEdits")));
    await assertSucceeds(getDocs(collection(db, "companies", A, "siteExits")));
  }
});

test("Edit pay: titles + rates; Employees: employee docs; a typed rate needs Edit pay too", async () => {
  await assertFails(updateDoc(ref(allSitesAdmin(["em"]), "jobs", "laborer"), { hourlyRate: 20 }));
  await assertFails(setDoc(ref(allSitesAdmin(["em"]), "jobs", "new"), { name: "X", hourlyRate: 1, active: true }));
  await assertSucceeds(updateDoc(ref(allSitesAdmin(["pay"]), "jobs", "laborer"), { hourlyRate: 20 }));
  await assertSucceeds(updateDoc(ref(restricted(["pay"]), "jobs", "laborer"), { hourlyRate: 21 }));

  await assertFails(updateDoc(ref(allSitesAdmin(["pay"]), "employees", "emp1"), { name: "J2" }));
  await assertSucceeds(updateDoc(ref(allSitesAdmin(["em"]), "employees", "emp1"), { name: "J2" }));
  await assertFails(updateDoc(ref(allSitesAdmin(["em"]), "employees", "emp1"), { hourlyRate: 30 }));
  await assertSucceeds(updateDoc(ref(allSitesAdmin(["em", "pay"]), "employees", "emp1"), { hourlyRate: 30 }));

  await assertFails(setDoc(ref(allSitesAdmin([]), "subcontractors", "s1"), { name: "Sub", active: true }));
  await assertSucceeds(setDoc(ref(allSitesAdmin(["em"]), "subcontractors", "s1"), { name: "Sub", active: true }));
});

test("Settings: company settings + job sites (createdByUid = creator, never rewritten)", async () => {
  await assertFails(updateDoc(doc(allSitesAdmin([]), "companies", A), { tipsEnabled: true }));
  await assertFails(updateDoc(doc(allSitesAdmin([]), "companies", A), { approvalsColumns: ["worked"] }));
  await assertSucceeds(updateDoc(doc(allSitesAdmin(["set"]), "companies", A), { tipsEnabled: true }));

  await assertFails(setDoc(ref(allSitesAdmin([]), "jobSites", "s2"), { name: "S2", active: true, createdByUid: "uidAll" }));
  await assertFails(setDoc(ref(restricted(["set"]), "jobSites", "s2"), { name: "S2", active: true }));
  await assertFails(setDoc(ref(restricted(["set"]), "jobSites", "s2"), { name: "S2", active: true, createdByUid: "someoneElse" }));
  await assertSucceeds(setDoc(ref(restricted(["set"]), "jobSites", "s2"), { name: "S2", active: true, createdByUid: "uidR" }));
  await assertFails(updateDoc(ref(restricted(["set"]), "jobSites", "s2"), { createdByUid: "x" }));
  await assertSucceeds(updateDoc(ref(restricted(["set"]), "jobSites", "s2"), { name: "S2b" }));
  await assertFails(updateDoc(ref(restricted([]), "jobSites", "siteA"), { name: "Nope" }));
});

test("Job sites: createdByUid only required for a restricted admin (backward compatible, Nov 25)", async () => {
  // owner / Full access / all-sites admin / legacy admin: may leave it out (live website)
  await assertSucceeds(setDoc(ref(owner(), "jobSites", "o1"), { name: "O1", active: true }));
  await assertSucceeds(setDoc(ref(fullAdmin(), "jobSites", "f1"), { name: "F1", active: true }));
  await assertSucceeds(setDoc(ref(allSitesAdmin(["set"]), "jobSites", "a1"), { name: "A1", active: true }));
  await assertSucceeds(setDoc(ref(legacyAdmin(), "jobSites", "l1"), { name: "L1", active: true }));
  // ...or send their own uid
  await assertSucceeds(setDoc(ref(owner(), "jobSites", "o2"), { name: "O2", active: true, createdByUid: "uidOwner" }));
  // never someone else's, never null
  await assertFails(setDoc(ref(owner(), "jobSites", "o3"), { name: "O3", active: true, createdByUid: "uidR" }));
  await assertFails(setDoc(ref(fullAdmin(), "jobSites", "f2"), { name: "F2", active: true, createdByUid: null }));
  // restricted admin (incl. one who is also a supervisor): must send their own
  await assertFails(setDoc(ref(restricted(["set"]), "jobSites", "r1"), { name: "R1", active: true }));
  await assertFails(setDoc(ref(restricted(["set"], { sup: true }), "jobSites", "r2"), { name: "R2", active: true }));
  await assertSucceeds(setDoc(ref(restricted(["set"]), "jobSites", "r3"), { name: "R3", active: true, createdByUid: "uidR" }));
  // still no Settings permission = no create
  await assertFails(setDoc(ref(allSitesAdmin([]), "jobSites", "a2"), { name: "A2", active: true }));
});

test("Invites: permission needed; an invite can never carry access (G2)", async () => {
  const invite = (extra = {}) => ({ companyId: A, role: "admin", email: "new@x.com", status: "pending", ...extra });
  await assertFails(addDoc(collection(allSitesAdmin([]), "invites"), invite()));
  await assertSucceeds(addDoc(collection(restricted(["inv"]), "invites"), invite()));
  for (const extra of [
    { adminAccess: { level: "full" } },
    { level: "full" },
    { lvl: "full" },
    { permissions: { billing: true } },
    { perms: ["bil"] },
    { sites: "all" },
    { allSites: true },
    { fullAccess: true },
  ]) {
    await assertFails(addDoc(collection(restricted(["inv"]), "invites"), invite(extra)));
  }
  await assertFails(addDoc(collection(restricted(["inv"]), "invites"), invite({ role: "owner" })));
  await assertSucceeds(addDoc(collection(legacyAdmin(), "invites"), invite()));
});

test("no escalation: nobody can write users docs (where access lives)", async () => {
  for (const db of [restricted(), allSitesAdmin(ALL_PERMS), fullAdmin(), owner(), legacyAdmin()]) {
    await assertFails(updateDoc(doc(db, "users", "uidTarget"), { adminAccess: { level: "full" } }));
    await assertFails(setDoc(doc(db, "users", "uidR"), { role: "admin", companyId: A, adminAccess: { level: "full" } }));
  }
});

test("Billing never comes from a legacy admin's missing claims (D8); the owner + Full access have it", async () => {
  // Billing is checked server-side (Stripe routes); here: the rules helper
  // still grants legacy admins everything they had (settings/pay/employees).
  await assertSucceeds(updateDoc(doc(legacyAdmin(), "companies", A), { tipsEnabled: true }));
  await assertSucceeds(updateDoc(ref(legacyAdmin(), "jobs", "laborer"), { hourlyRate: 16 }));
  await assertSucceeds(updateDoc(ref(fullAdmin(), "jobs", "laborer"), { hourlyRate: 17 }));
  // ...but no permission can unlock the server-only billing fields.
  await assertFails(updateDoc(doc(fullAdmin(), "companies", A), { planTier: "pro_tier2" }));
});

// ---- G1: the prod apps' paths stay exactly as today ----

function appClockIn(localId, createdByUid, employeeId = "emp1") {
  const t = new Date("2026-10-29T14:00:00Z");
  return {
    localId,
    employeeId,
    employeeName: "Jordan",
    siteId: "siteC",
    siteName: "Site C",
    subcontractorId: null,
    subcontractorName: null,
    type: "in",
    source: "pin",
    photoPending: true,
    note: null,
    authorizedById: null,
    authorizedByName: null,
    reason: null,
    overrideEventId: null,
    deviceId: "3f0f6b8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    deviceNameSnapshot: null,
    createdByUid,
    clientTimestamp: t,
    timestamp: t,
    createdAt: t,
  };
}

test("G1 supervisor app: list/read every site, punch, replay, notes, devices, alerts unchanged", async () => {
  const db = supervisor();
  await assertSucceeds(getDocs(collection(db, "companies", A, "clockEvents")));
  await assertSucceeds(getDoc(ref(db, "clockEvents", "inC")));
  const punch = ref(db, "clockEvents", "l1");
  await assertSucceeds(setDoc(punch, appClockIn("l1", "uidSup"), { merge: true }));
  await assertSucceeds(setDoc(punch, appClockIn("l1", "uidSup"), { merge: true })); // idempotent replay
  await assertSucceeds(getDocs(collection(db, "companies", A, "shiftNotes")));
  await assertSucceeds(setDoc(ref(db, "shiftNotes", "supNote"), { employeeId: "emp1", note: "site note", createdByUid: "uidSup" }));
  await assertSucceeds(getDocs(collection(db, "companies", A, "siteExits")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "alerts")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "devices")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "employees")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "jobSites")));
  await assertSucceeds(addDoc(collection(db, "companies", A, "alertActions"), { resolvedByUid: "uidSup", status: "ignored" }));
  // ...and still never the admin-only data.
  await assertFails(getDocs(collection(db, "companies", A, "timesheetApprovals")));
});

test("G1 restricted admin + supervisor can still punch from the supervisor app", async () => {
  const db = restricted([], { sup: true, employeeId: "sup-emp" });
  await assertSucceeds(setDoc(ref(db, "clockEvents", "l2"), appClockIn("l2", "uidR"), { merge: true }));
});

test("G1 employee app: own events/notes only, unchanged", async () => {
  const db = employee();
  await assertSucceeds(getDocs(query(collection(db, "companies", A, "clockEvents"), where("employeeId", "==", "selfEmp"))));
  await assertSucceeds(getDoc(ref(db, "clockEvents", "eveIn")));
  await assertFails(getDoc(ref(db, "clockEvents", "inA")));
  await assertFails(getDocs(collection(db, "companies", A, "clockEvents")));
  await assertFails(getDocs(collection(db, "companies", A, "timesheetApprovals")));
  await assertFails(setDoc(ref(db, "clockEvents", "e2"), appClockIn("e2", "uidEmp", "selfEmp")));
});
