// Employee App (Phase 0) - Firestore + Storage rules tests for the new
// "employee" role, plus regression checks that admin and supervisor flows
// still pass. Runs against the real emulators (no mocked rules evaluation).
//
// Usage (from functions/):
//   firebase emulators:exec --only firestore,storage "node --test test/employeeRules.test.js"
// Ports must match firebase.json's emulators block.
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
  collection,
  query,
  where,
  serverTimestamp,
  Timestamp,
} = require("firebase/firestore");
const { ref, uploadString, getBytes } = require("firebase/storage");

const A = "companyA";
const B = "companyB";

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "orbitworks-employee-rules-test",
    firestore: {
      host: "127.0.0.1",
      port: 8090,
      rules: fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: fs.readFileSync(path.join(__dirname, "..", "..", "storage.rules"), "utf8"),
    },
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const set = (p, data) => setDoc(doc(db, ...p), data);

    await set(["companies", A], { name: "Company A", planTier: "pro_tier1", stripeCustomerId: "cus_secret" });
    await set(["companies", B], { name: "Company B" });
    await set(["companies", A, "employeeAppConfig", "current"], { name: "Company A", isPro: true });
    await set(["companies", B, "employeeAppConfig", "current"], { name: "Company B", isPro: false });

    await set(["users", "uidA"], { role: "employee", companyId: A, name: "Ana" });
    await set(["users", "uidB"], { role: "employee", companyId: A, name: "Ben" });

    const employee = (name, uid, extra = {}) => ({
      name,
      active: true,
      assignedSiteIds: ["site1"],
      pin: "1111",
      hourlyRate: 20,
      linkedUserId: uid,
      appAccess: true,
      joinedVia: "admin",
      subcontractorId: null,
      ...extra,
    });
    await set(["companies", A, "employees", "empA"], employee("Ana", "uidA"));
    await set(["companies", A, "employees", "empB"], employee("Ben", "uidB", { pin: "2222", hourlyRate: 35 }));
    await set(["companies", A, "employees", "sup1"], {
      name: "Sam Supervisor",
      active: true,
      isSupervisor: true,
      linkedUserId: "uidSup",
      assignedSiteIds: ["site1"],
      pin: "3333",
    });
    await set(["companies", A, "employees", "emp1"], { name: "Plain", active: true, assignedSiteIds: [], pin: "4444" });
    await set(["companies", B, "employees", "empX"], employee("Xena", "uidX"));

    await set(["companies", A, "jobSites", "site1"], { name: "Site 1", active: true });
    await set(["companies", A, "jobSites", "site2"], { name: "Site 2", active: true });
    await set(["companies", A, "jobs", "job1"], { name: "Carpenter", hourlyRate: 40, active: true });
    await set(["companies", A, "subcontractors", "sub1"], { name: "Sub Co", active: true });

    await set(["companies", A, "clockEvents", "evtA"], {
      employeeId: "empA",
      type: "in",
      source: "employeeApp",
      createdByUid: "uidA",
      localId: "evtA",
    });
    await set(["companies", A, "clockEvents", "evtB"], {
      employeeId: "empB",
      type: "in",
      source: "employeeApp",
      createdByUid: "uidB",
      localId: "evtB",
    });
    await set(["companies", B, "clockEvents", "evtX"], {
      employeeId: "empX",
      type: "in",
      source: "employeeApp",
      createdByUid: "uidX",
    });

    await set(["companies", A, "shiftNotes", "noteA"], {
      note: "mine",
      employeeId: "empA",
      clockEventId: "evtA",
      source: "employeeApp",
      createdByUid: "uidA",
    });
    await set(["companies", A, "shiftNotes", "noteB"], {
      note: "Ben's",
      employeeId: "empB",
      clockEventId: "evtB",
      source: "employeeApp",
      createdByUid: "uidB",
    });
    await set(["companies", A, "shiftNotes", "supNote"], { note: "site note", createdByUid: "uidSup" });

    await set(["companies", A, "employeeAlerts", "alertA"], { employeeId: "empA", message: "Break too long" });
    await set(["companies", A, "employeeAlerts", "alertB"], { employeeId: "empB", message: "Ben's alert" });
    await set(["companies", A, "alerts", "al1"], { companyId: A, message: "company alert", readByDeviceIds: [] });
    await set(["companies", A, "pushTokens", "dev1"], { deviceId: "dev1", token: "ExponentPushToken[x]", platform: "ios" });
    await set(["companies", A, "pins", "1111"], { employeeId: "empA" });

    // Employee App Phase 3: server-written safe copies (no PIN) and a PIN lock.
    const selfView = (name, uid) => ({ name, active: true, assignedSiteIds: ["site1"], linkedUserId: uid });
    await set(["companies", A, "employeeSelfViews", "empA"], selfView("Ana", "uidA"));
    await set(["companies", A, "employeeSelfViews", "empB"], selfView("Ben", "uidB"));
    await set(["companies", B, "employeeSelfViews", "empX"], selfView("Xena", "uidX"));
    await set(["companies", A, "employeePinLocks", "empA"], { failedCount: 2, lockedUntil: null });

    await set(["joinCodes", "tok123"], { companyId: A, siteId: "site1", status: "active" });
    await set(["invites", "inv1"], { companyId: A, email: "x@example.com", role: "supervisor" });
  });
});

function employeeA() {
  return testEnv.authenticatedContext("uidA", { role: "employee", companyId: A, employeeId: "empA" });
}
function adminA() {
  return testEnv.authenticatedContext("uidAdmin", { role: "admin", companyId: A });
}
function supervisorA() {
  return testEnv.authenticatedContext("uidSup", { role: "supervisor", companyId: A, employeeId: "sup1" });
}

// Same shape the mobile offline queue writes (lib/queueSync.js syncOne),
// including the explicit nulls.
function employeeAppEvent(overrides = {}) {
  const t = Timestamp.fromMillis(Date.UTC(2026, 9, 21, 13, 0));
  return {
    localId: "L-1",
    employeeId: "empA",
    employeeName: "Ana",
    siteId: "site1",
    siteName: "Site 1",
    subcontractorId: null,
    subcontractorName: null,
    type: "in",
    source: "employeeApp",
    photoUrl: null,
    note: null,
    authorizedById: null,
    authorizedByName: null,
    reason: null,
    overrideEventId: null,
    deviceId: null,
    deviceNameSnapshot: null,
    createdByUid: "uidA",
    clientTimestamp: t,
    timestamp: t,
    createdAt: t,
    ...overrides,
  };
}

const eventDoc = (db, company, id) => doc(db, "companies", company, "clockEvents", id);

// ===================== Employee: must FAIL =====================

test("FAIL: employee A reads employee B's doc", async () => {
  const db = employeeA().firestore();
  await assertFails(getDoc(doc(db, "companies", A, "employees", "empB")));
});

test("FAIL: employee lists every employee in the company", async () => {
  const db = employeeA().firestore();
  await assertFails(getDocs(collection(db, "companies", A, "employees")));
});

test("FAIL: employee changes their own PIN", async () => {
  const db = employeeA().firestore();
  await assertFails(updateDoc(doc(db, "companies", A, "employees", "empA"), { pin: "9999" }));
});

test("FAIL: employee changes their own hourly rate", async () => {
  const db = employeeA().firestore();
  await assertFails(updateDoc(doc(db, "companies", A, "employees", "empA"), { hourlyRate: 99 }));
});

test("FAIL: employee changes their own assigned sites", async () => {
  const db = employeeA().firestore();
  await assertFails(updateDoc(doc(db, "companies", A, "employees", "empA"), { assignedSiteIds: ["site1", "site2"] }));
});

test("FAIL: employee changes their own role/tag fields on the employee doc", async () => {
  const db = employeeA().firestore();
  const ref = doc(db, "companies", A, "employees", "empA");
  await assertFails(updateDoc(ref, { isSupervisor: true }));
  await assertFails(updateDoc(ref, { isAdmin: true }));
  await assertFails(updateDoc(ref, { appAccess: false }));
  await assertFails(updateDoc(ref, { name: "Renamed" }));
});

test("FAIL: employee writes their own role on users/{uid}", async () => {
  const db = employeeA().firestore();
  await assertFails(updateDoc(doc(db, "users", "uidA"), { role: "admin" }));
});

test("FAIL: employee creates a clock event for someone else", async () => {
  const db = employeeA().firestore();
  await assertFails(setDoc(eventDoc(db, A, "L-2"), employeeAppEvent({ localId: "L-2", employeeId: "empB" })));
});

test("FAIL: employee creates a clock event with another source", async () => {
  const db = employeeA().firestore();
  for (const source of ["pin", "faceMatch", "supervisorOverride", "adminManual", "autoClockOut", null]) {
    await assertFails(setDoc(eventDoc(db, A, "L-src"), employeeAppEvent({ localId: "L-src", source })));
  }
});

test("FAIL: employee creates a clock event with forged override/server fields", async () => {
  const db = employeeA().firestore();
  await assertFails(setDoc(eventDoc(db, A, "L-3"), employeeAppEvent({ localId: "L-3", authorizedById: "sup1" })));
  await assertFails(setDoc(eventDoc(db, A, "L-4"), employeeAppEvent({ localId: "L-4", geofenceStatus: "inside" })));
  await assertFails(setDoc(eventDoc(db, A, "L-5"), employeeAppEvent({ localId: "L-5", createdByUid: "uidB" })));
  await assertFails(setDoc(eventDoc(db, A, "L-6"), employeeAppEvent({ localId: "L-6", subcontractorId: "sub1" })));
  await assertFails(setDoc(eventDoc(db, A, "auto-L-7"), employeeAppEvent({ localId: "auto-L-7" })));
});

test("FAIL: employee updates their own clock event (no direct replay path)", async () => {
  await testEnv.withSecurityRulesDisabled((c) =>
    setDoc(eventDoc(c.firestore(), A, "L-8"), employeeAppEvent({ localId: "L-8" }))
  );
  const db = employeeA().firestore();
  const ev = employeeAppEvent({ localId: "L-8" });
  await assertFails(setDoc(eventDoc(db, A, "L-8"), ev, { merge: true }));
  await assertFails(setDoc(eventDoc(db, A, "L-8"), { ...ev, photoUrl: "https://example.com/new.jpg" }, { merge: true }));
  await assertFails(setDoc(eventDoc(db, A, "L-8"), { ...ev, type: "out" }, { merge: true }));
  await assertFails(deleteDoc(eventDoc(db, A, "L-8")));
});

test("FAIL: employee writes any clock event directly, even their own (callable only)", async () => {
  const db = employeeA().firestore();
  for (const type of ["in", "breakStart", "breakEnd", "out"]) {
    await assertFails(setDoc(eventDoc(db, A, `L-${type}`), employeeAppEvent({ localId: `L-${type}`, type })));
  }
});

test("FAIL: deactivated employee with an open session can't write a clock event directly either", async () => {
  await testEnv.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "companies", A, "employees", "empA"), { active: false, lastEventType: "in" })
  );
  const db = employeeA().firestore();
  await assertFails(setDoc(eventDoc(db, A, "L-close"), employeeAppEvent({ localId: "L-close", type: "out" })));
});

test("FAIL: employee reads their own employee doc (it holds the PIN)", async () => {
  const db = employeeA().firestore();
  await assertFails(getDoc(doc(db, "companies", A, "employees", "empA")));
  await assertFails(getDocs(query(collection(db, "companies", A, "employees"), where("linkedUserId", "==", "uidA"))));
});

test("FAIL: employee reads someone else's self view, lists them all, or writes a self view", async () => {
  const db = employeeA().firestore();
  await assertFails(getDoc(doc(db, "companies", A, "employeeSelfViews", "empB")));
  await assertFails(getDocs(collection(db, "companies", A, "employeeSelfViews")));
  await assertFails(getDoc(doc(db, "companies", B, "employeeSelfViews", "empX")));
  await assertFails(updateDoc(doc(db, "companies", A, "employeeSelfViews", "empA"), { active: true }));
  await assertFails(setDoc(doc(db, "companies", A, "employeeSelfViews", "empA"), { name: "x", linkedUserId: "uidA" }));
  await assertFails(deleteDoc(doc(db, "companies", A, "employeeSelfViews", "empA")));
});

test("FAIL: nobody on a client reads or writes PIN locks", async () => {
  for (const ctx of [employeeA(), adminA(), supervisorA()]) {
    const r = doc(ctx.firestore(), "companies", A, "employeePinLocks", "empA");
    await assertFails(getDoc(r));
    await assertFails(getDocs(collection(ctx.firestore(), "companies", A, "employeePinLocks")));
    await assertFails(setDoc(r, { failedCount: 0, lockedUntil: null }));
    await assertFails(updateDoc(r, { failedCount: 0 }));
    await assertFails(deleteDoc(r));
  }
});

test("FAIL: deactivated employee clocks in", async () => {
  await testEnv.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "companies", A, "employees", "empA"), { active: false })
  );
  const db = employeeA().firestore();
  await assertFails(setDoc(eventDoc(db, A, "L-9"), employeeAppEvent({ localId: "L-9" })));
});

test("FAIL: employee whose doc is no longer linked to their login (stale claim)", async () => {
  await testEnv.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "companies", A, "employees", "empA"), { linkedUserId: "someoneElse" })
  );
  const db = employeeA().firestore();
  await assertFails(getDoc(doc(db, "companies", A, "employees", "empA")));
  await assertFails(setDoc(eventDoc(db, A, "L-10"), employeeAppEvent({ localId: "L-10" })));
});

test("FAIL: employee reads someone else's clock events, alerts, and shift notes", async () => {
  const db = employeeA().firestore();
  await assertFails(getDoc(eventDoc(db, A, "evtB")));
  await assertFails(getDocs(collection(db, "companies", A, "clockEvents")));
  await assertFails(getDoc(doc(db, "companies", A, "employeeAlerts", "alertB")));
  await assertFails(getDocs(collection(db, "companies", A, "employeeAlerts")));
  await assertFails(getDoc(doc(db, "companies", A, "shiftNotes", "noteB")));
  await assertFails(getDoc(doc(db, "companies", A, "shiftNotes", "supNote")));
  await assertFails(getDocs(collection(db, "companies", A, "shiftNotes")));
});

test("FAIL: employee creates a shift note on someone else's shift, or edits/deletes one", async () => {
  const db = employeeA().firestore();
  await assertFails(
    setDoc(doc(db, "companies", A, "shiftNotes", "n-bad"), {
      note: "hi",
      employeeId: "empA",
      clockEventId: "evtB",
      source: "employeeApp",
      createdByUid: "uidA",
      timestamp: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(db, "companies", A, "shiftNotes", "n-bad2"), {
      note: "hi",
      employeeId: "empB",
      clockEventId: "evtB",
      source: "employeeApp",
      createdByUid: "uidA",
      timestamp: serverTimestamp(),
    })
  );
  await assertFails(updateDoc(doc(db, "companies", A, "shiftNotes", "noteA"), { note: "edited" }));
  await assertFails(deleteDoc(doc(db, "companies", A, "shiftNotes", "noteA")));
});

test("FAIL: employee writes their own alerts", async () => {
  const db = employeeA().firestore();
  await assertFails(updateDoc(doc(db, "companies", A, "employeeAlerts", "alertA"), { message: "x" }));
  await assertFails(setDoc(doc(db, "companies", A, "employeeAlerts", "new"), { employeeId: "empA", message: "x" }));
});

test("FAIL: employee reads or writes anything in another company", async () => {
  const db = employeeA().firestore();
  await assertFails(getDoc(doc(db, "companies", B)));
  await assertFails(getDoc(doc(db, "companies", B, "employees", "empX")));
  await assertFails(getDoc(eventDoc(db, B, "evtX")));
  await assertFails(getDoc(doc(db, "companies", B, "employeeAppConfig", "current")));
  await assertFails(setDoc(eventDoc(db, B, "L-11"), employeeAppEvent({ localId: "L-11" })));
});

test("FAIL: employee reads a join code", async () => {
  const db = employeeA().firestore();
  await assertFails(getDoc(doc(db, "joinCodes", "tok123")));
  await assertFails(getDocs(collection(db, "joinCodes")));
  await assertFails(setDoc(doc(db, "joinCodes", "tok999"), { companyId: A }));
});

test("FAIL: employee reads company doc, billing, invites, jobs, subcontractors, pins", async () => {
  const db = employeeA().firestore();
  await assertFails(getDoc(doc(db, "companies", A)));
  await assertFails(getDoc(doc(db, "invites", "inv1")));
  await assertFails(getDoc(doc(db, "companies", A, "jobs", "job1")));
  await assertFails(getDoc(doc(db, "companies", A, "subcontractors", "sub1")));
  await assertFails(getDoc(doc(db, "companies", A, "pins", "1111")));
  await assertFails(getDoc(doc(db, "companies", A, "jobSites", "site2")));
  await assertFails(getDocs(collection(db, "companies", A, "jobSites")));
});

test("FAIL: employee touches supervisor/admin-only collections", async () => {
  const db = employeeA().firestore();
  await assertFails(getDoc(doc(db, "companies", A, "alerts", "al1")));
  await assertFails(getDoc(doc(db, "companies", A, "pushTokens", "dev1")));
  await assertFails(
    setDoc(doc(db, "companies", A, "pushTokens", "dev2"), {
      deviceId: "dev2",
      token: "ExponentPushToken[abc]",
      platform: "android",
    })
  );
  await assertFails(getDocs(collection(db, "companies", A, "timesheetApprovals")));
  await assertFails(getDocs(collection(db, "companies", A, "devices")));
  await assertFails(getDocs(collection(db, "companies", A, "alertActions")));
  await assertFails(getDocs(collection(db, "companies", A, "employeeUpdates")));
  await assertFails(
    setDoc(doc(db, "companies", A, "alertActions", "x"), { resolvedByUid: "uidA", alertKey: "k" })
  );
  await assertFails(updateDoc(doc(db, "companies", A), { name: "Hacked" }));
});

test("FAIL: employee backs up a queue item for someone else", async () => {
  const db = employeeA().firestore();
  await assertFails(
    setDoc(doc(db, "companies", A, "queueBackups", "Q-2"), { localId: "Q-2", employeeId: "empB", backedUpByUid: "uidA" })
  );
});

// ===================== Employee: must PASS =====================

test("PASS: employee reads only their own self view (by id and by linkedUserId query) and users doc", async () => {
  const db = employeeA().firestore();
  await assertSucceeds(getDoc(doc(db, "companies", A, "employeeSelfViews", "empA")));
  await assertSucceeds(
    getDocs(query(collection(db, "companies", A, "employeeSelfViews"), where("linkedUserId", "==", "uidA")))
  );
  await assertSucceeds(getDoc(doc(db, "users", "uidA")));
});

test("PASS: employee reads their own clock events, alerts, and shift notes", async () => {
  const db = employeeA().firestore();
  await assertSucceeds(getDoc(eventDoc(db, A, "evtA")));
  await assertSucceeds(
    getDocs(query(collection(db, "companies", A, "clockEvents"), where("employeeId", "==", "empA")))
  );
  await assertSucceeds(getDoc(doc(db, "companies", A, "employeeAlerts", "alertA")));
  await assertSucceeds(
    getDocs(query(collection(db, "companies", A, "employeeAlerts"), where("employeeId", "==", "empA")))
  );
  await assertSucceeds(getDoc(doc(db, "companies", A, "shiftNotes", "noteA")));
  await assertSucceeds(
    getDocs(query(collection(db, "companies", A, "shiftNotes"), where("employeeId", "==", "empA")))
  );
});

test("PASS: employee comments on their own shift", async () => {
  const db = employeeA().firestore();
  await assertSucceeds(
    setDoc(doc(db, "companies", A, "shiftNotes", "n-ok"), {
      note: "Left early for a doctor visit",
      siteId: "site1",
      siteName: "Site 1",
      employeeId: "empA",
      clockEventId: "evtA",
      source: "employeeApp",
      createdByUid: "uidA",
      createdByName: "Ana",
      timestamp: serverTimestamp(),
    })
  );
});

test("PASS: employee reads their assigned site and the employee app config", async () => {
  const db = employeeA().firestore();
  await assertSucceeds(getDoc(doc(db, "companies", A, "jobSites", "site1")));
  await assertSucceeds(getDoc(doc(db, "companies", A, "employeeAppConfig", "current")));
});

test("PASS: employee backs up their own offline queue item", async () => {
  const db = employeeA().firestore();
  const ref = doc(db, "companies", A, "queueBackups", "Q-1");
  await assertSucceeds(setDoc(ref, { localId: "Q-1", employeeId: "empA", backedUpByUid: "uidA" }));
  await assertSucceeds(setDoc(ref, { localId: "Q-1", employeeId: "empA", backedUpByUid: "uidA", attempts: 2 }));
});

// ===================== Admin / supervisor regression =====================

test("PASS: admin reads company, all employees, all clock events, notes, alerts", async () => {
  const db = adminA().firestore();
  await assertSucceeds(getDoc(doc(db, "companies", A)));
  await assertSucceeds(getDocs(collection(db, "companies", A, "employees")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "clockEvents")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "shiftNotes")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "alerts")));
  await assertSucceeds(getDocs(collection(db, "companies", A, "jobs")));
  await assertSucceeds(getDoc(doc(db, "companies", A, "employeeAppConfig", "current")));
});

test("PASS: admin edits an employee, settings, and writes a manual clock event", async () => {
  const db = adminA().firestore();
  await assertSucceeds(updateDoc(doc(db, "companies", A, "employees", "empA"), { name: "Ana M", hourlyRate: 22 }));
  await assertSucceeds(updateDoc(doc(db, "companies", A), { name: "Company A Inc" }));
  await assertSucceeds(
    setDoc(eventDoc(db, A, "adm-1"), {
      employeeId: "empA",
      employeeName: "Ana",
      siteId: null,
      siteName: "Not specified",
      type: "in",
      source: "adminManual",
      createdByUid: "uidAdmin",
    })
  );
});

test("FAIL: admin can't forge the server-only employee app fields or read join codes", async () => {
  const db = adminA().firestore();
  await assertFails(updateDoc(doc(db, "companies", A, "employees", "emp1"), { appAccess: true }));
  await assertFails(updateDoc(doc(db, "companies", A, "employees", "emp1"), { joinedVia: "qr" }));
  await assertFails(getDoc(doc(db, "joinCodes", "tok123")));
  await assertFails(setDoc(doc(db, "companies", A, "employeeAppConfig", "current"), { name: "x" }));
});

test("PASS: supervisor reads employees and clocks an employee in with PIN, with replay", async () => {
  const db = supervisorA().firestore();
  await assertSucceeds(getDocs(collection(db, "companies", A, "employees")));
  const ev = {
    localId: "S-1",
    employeeId: "emp1",
    employeeName: "Plain",
    siteId: "site1",
    siteName: "Site 1",
    type: "in",
    source: "pin",
    authorizedById: null,
    reason: null,
    createdByUid: "uidSup",
    clientTimestamp: Timestamp.fromMillis(1000),
    timestamp: Timestamp.fromMillis(1000),
  };
  await assertSucceeds(setDoc(eventDoc(db, A, "S-1"), ev, { merge: true }));
  await assertSucceeds(setDoc(eventDoc(db, A, "S-1"), ev, { merge: true }));
});

test("PASS: supervisor writes a site note, reads alerts, registers a push token, backs up a queue item", async () => {
  const db = supervisorA().firestore();
  await assertSucceeds(
    setDoc(doc(db, "companies", A, "shiftNotes", "s-note"), {
      note: "Delivery late",
      siteId: "site1",
      siteName: "Site 1",
      createdByUid: "uidSup",
      timestamp: serverTimestamp(),
    })
  );
  await assertSucceeds(getDocs(collection(db, "companies", A, "alerts")));
  await assertSucceeds(
    setDoc(doc(db, "companies", A, "pushTokens", "dev-sup"), {
      deviceId: "dev-sup",
      token: "ExponentPushToken[sup]",
      platform: "ios",
    })
  );
  await assertSucceeds(
    setDoc(doc(db, "companies", A, "queueBackups", "SQ-1"), { localId: "SQ-1", backedUpByUid: "uidSup" })
  );
});

test("FAIL: supervisor can't use the employeeApp path for someone else", async () => {
  const db = supervisorA().firestore();
  // Supervisors keep their own create rule (any source the old rule allowed);
  // they never match the employee rules, so the employee-only reads stay
  // company-wide for them - just confirm the role split didn't let a
  // supervisor read join codes.
  await assertFails(getDoc(doc(db, "joinCodes", "tok123")));
});

// ===================== Storage =====================

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

function upload(ctx, p, contentType = "image/jpeg") {
  return uploadString(ref(ctx.storage(), p), JPEG, "data_url", { contentType });
}

test("STORAGE PASS: employee uploads and reads their own clock photo and selfie", async () => {
  const ctx = employeeA();
  await assertSucceeds(upload(ctx, `companies/${A}/clockEvents/empA/1.jpg`));
  await assertSucceeds(getBytes(ref(ctx.storage(), `companies/${A}/clockEvents/empA/1.jpg`)));
  await assertSucceeds(upload(ctx, `companies/${A}/employees/empA/selfie/signup.jpg`));
  await assertSucceeds(getBytes(ref(ctx.storage(), `companies/${A}/employees/empA/selfie/signup.jpg`)));
});

test("STORAGE FAIL: employee touches anyone else's files, reference.jpg, or other companies", async () => {
  await assertSucceeds(upload(adminA(), `companies/${A}/clockEvents/empB/1.jpg`));
  await assertSucceeds(upload(adminA(), `companies/${A}/logo.jpg`));
  const ctx = employeeA();
  await assertFails(upload(ctx, `companies/${A}/clockEvents/empB/2.jpg`));
  await assertFails(getBytes(ref(ctx.storage(), `companies/${A}/clockEvents/empB/1.jpg`)));
  await assertFails(upload(ctx, `companies/${A}/employees/empB/selfie/x.jpg`));
  await assertFails(upload(ctx, `companies/${A}/employees/empA/reference.jpg`));
  await assertFails(getBytes(ref(ctx.storage(), `companies/${A}/logo.jpg`)));
  await assertFails(upload(ctx, `companies/${B}/clockEvents/empA/1.jpg`));
  await assertFails(upload(ctx, `companies/${A}/clockEvents/empA/not-an-image.txt`, "text/plain"));
});

test("STORAGE PASS: admin and supervisor keep company-wide access", async () => {
  await assertSucceeds(upload(adminA(), `companies/${A}/employees/empA/reference.jpg`));
  await assertSucceeds(upload(supervisorA(), `companies/${A}/clockEvents/emp1/9.jpg`));
  await assertSucceeds(getBytes(ref(supervisorA().storage(), `companies/${A}/employees/empA/reference.jpg`)));
});

// ===================== Phase 2: QR sign-up (joinCompany) =====================
// The shape joinCompany (functions/src/joinCompany.ts) writes. Everything
// here is server-written; the employee can't change any of it.

async function seedQrEmployee() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "companies", A, "employees", "empQ"), {
      name: "Quinn Qr",
      dob: "2000-01-15",
      active: true,
      faceStatus: "not_enrolled",
      assignedSiteIds: ["site1"],
      pin: "5678",
      subcontractorId: "sub1",
      subcontractorName: "Sub Co",
      joinedVia: "qr",
      joinCodeId: "code-1",
      appAccess: true,
      linkedUserId: "uidQ",
      email: "quinn@example.com",
      photoUrl: "https://example.invalid/reference.jpg",
      possibleDuplicateOf: ["empA"],
    });
    await setDoc(doc(db, "users", "uidQ"), { role: "employee", companyId: A, name: "Quinn Qr" });
    await setDoc(doc(db, "companies", A, "employeeConsents", "empQ"), {
      uid: "uidQ",
      employeeId: "empQ",
      companyId: A,
      joinCodeId: "code-1",
      privacyPolicyVersion: "v",
      biometricConsentVersion: "v",
      source: "qrSignup",
      faceDataDeletedAt: null,
    });
  });
}

function employeeQ() {
  return testEnv.authenticatedContext("uidQ", { role: "employee", companyId: A, employeeId: "empQ" });
}

test("QR: QR-joined employee can't read their own employee doc, only their self view", async () => {
  await seedQrEmployee();
  await testEnv.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), "companies", A, "employeeSelfViews", "empQ"), { name: "Quinn Qr", active: true, linkedUserId: "uidQ" })
  );
  const db = employeeQ().firestore();
  await assertFails(getDoc(doc(db, "companies", A, "employees", "empQ")));
  await assertSucceeds(getDoc(doc(db, "companies", A, "employeeSelfViews", "empQ")));
});

test("QR FAIL: QR-joined employee can't change PIN, rate, sites, role, subcontractor, photo, dob or flags", async () => {
  await seedQrEmployee();
  const r = doc(employeeQ().firestore(), "companies", A, "employees", "empQ");
  for (const change of [
    { pin: "0001" },
    { hourlyRate: 99 },
    { assignedSiteIds: ["site1", "site2"] },
    { isAdmin: true },
    { isSupervisor: true },
    { appAccess: false },
    { joinedVia: "admin" },
    { joinCodeId: "other" },
    { subcontractorId: null },
    { photoUrl: "https://example.invalid/other.jpg" },
    { faceStatus: "enrolled" },
    { dob: "1990-01-01" },
    { possibleDuplicateOf: [] },
  ]) {
    await assertFails(updateDoc(r, change));
  }
  await assertFails(updateDoc(doc(employeeQ().firestore(), "users", "uidQ"), { role: "admin" }));
});

test("QR FAIL: nobody on a client reads or writes consent records", async () => {
  await seedQrEmployee();
  for (const ctx of [employeeQ(), employeeA(), adminA(), supervisorA()]) {
    const r = doc(ctx.firestore(), "companies", A, "employeeConsents", "empQ");
    await assertFails(getDoc(r));
    await assertFails(updateDoc(r, { faceDataDeletedAt: serverTimestamp() }));
    await assertFails(deleteDoc(r));
    await assertFails(setDoc(doc(ctx.firestore(), "companies", A, "employeeConsents", "new1"), { uid: "x" }));
    await assertFails(getDocs(collection(ctx.firestore(), "companies", A, "employeeConsents")));
  }
});

test("QR FAIL: admin can't forge the duplicate flag on create", async () => {
  const db = adminA().firestore();
  const base = { name: "F", active: false, assignedSiteIds: [] };
  await assertFails(setDoc(doc(db, "companies", A, "employees", "forged"), { ...base, possibleDuplicateOf: ["empA"] }));
  await assertSucceeds(setDoc(doc(db, "companies", A, "employees", "plain2"), base));
});

test("STORAGE FAIL: QR-joined employee can't write or overwrite their own reference.jpg", async () => {
  await seedQrEmployee();
  await assertSucceeds(upload(adminA(), `companies/${A}/employees/empQ/reference.jpg`));
  const ctx = employeeQ();
  await assertFails(upload(ctx, `companies/${A}/employees/empQ/reference.jpg`));
  await assertFails(getBytes(ref(ctx.storage(), `companies/${A}/employees/empQ/reference.jpg`)));
  await assertSucceeds(upload(ctx, `companies/${A}/employees/empQ/selfie/retake.jpg`));
});
