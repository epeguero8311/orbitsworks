// Phase 4 emulator tests - Device Recognition Pro, firestore.rules only.
// Run via: firebase emulators:exec --only firestore "node test/deviceRules.test.mjs"
// Does not touch prod. Requires the Firestore emulator (see firebase.json's
// "emulators" block for the port) - firebase emulators:exec sets
// FIRESTORE_EMULATOR_HOST for us automatically.

import { readFileSync } from "fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";

const COMPANY_ID = "companyA";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`FAIL: ${name} - ${err.message}`);
    failed++;
  }
}

async function seedBaseline(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "companies", COMPANY_ID), { planTier: "pro_tier1" });
    await setDoc(doc(db, "companies", COMPANY_ID, "employees", "sup1"), {
      active: true,
      isSupervisor: true,
      name: "Sup One",
    });
    await setDoc(doc(db, "companies", COMPANY_ID, "employees", "emp1"), {
      active: true,
      name: "Emp One",
    });
    await setDoc(doc(db, "companies", COMPANY_ID, "employees", "sup2"), {
      active: false,
      isSupervisor: true,
      name: "Sup Two (deactivated)",
    });
  });
}

async function seedDevice(testEnv, deviceId, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "companies", COMPANY_ID, "devices", deviceId), data);
  });
}

function supervisorCtx(testEnv) {
  return testEnv.authenticatedContext("sup1", {
    role: "supervisor",
    companyId: COMPANY_ID,
    employeeId: "sup1",
  });
}

function adminCtx(testEnv) {
  return testEnv.authenticatedContext("admin1", {
    role: "admin",
    companyId: COMPANY_ID,
  });
}

function inactiveSupervisorCtx(testEnv) {
  return testEnv.authenticatedContext("sup2", {
    role: "supervisor",
    companyId: COMPANY_ID,
    employeeId: "sup2",
  });
}

function employeeCtx(testEnv) {
  return testEnv.authenticatedContext("emp1", {
    role: "employee",
    companyId: COMPANY_ID,
    employeeId: "emp1",
  });
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: "orbitworks-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8090,
    },
  });

  await seedBaseline(testEnv);

  // --- Device lock/rename matrix (Phase 4 spec) ---

  await seedDevice(testEnv, "dev-unlocked", {
    name: "Truck 1",
    platform: "ios",
    model: "iPhone 12",
    createdByUid: "sup1",
    createdAt: Timestamp.now(),
    locked: false,
  });

  await test("supervisor rename unlocked device -> allow", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-unlocked"), {
        name: "Truck 1 Renamed",
        updatedAt: Timestamp.now(),
        updatedByUid: "sup1",
      })
    );
  });

  await seedDevice(testEnv, "dev-locked", {
    name: "Truck 2",
    platform: "android",
    model: "Pixel 7",
    createdByUid: "admin1",
    createdAt: Timestamp.now(),
    locked: true,
    lockedByUid: "admin1",
    lockedAt: Timestamp.now(),
  });

  await test("supervisor rename locked device -> deny", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertFails(
      updateDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-locked"), {
        name: "Hijacked Name",
        updatedAt: Timestamp.now(),
        updatedByUid: "sup1",
      })
    );
  });

  await test("admin rename locked device -> deny", async () => {
    const db = adminCtx(testEnv).firestore();
    await assertFails(
      updateDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-locked"), {
        name: "Admin Renamed While Locked",
        updatedAt: Timestamp.now(),
        updatedByUid: "admin1",
      })
    );
  });

  await test("admin unlock locked device -> allow", async () => {
    const db = adminCtx(testEnv).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-locked"), {
        locked: false,
        lockedByUid: "admin1",
        lockedAt: Timestamp.now(),
      })
    );
  });

  await test("client write lastSeenAt directly -> deny", async () => {
    const db = adminCtx(testEnv).firestore();
    await assertFails(
      updateDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-unlocked"), {
        lastSeenAt: Timestamp.now(),
        lastUserUid: "admin1",
      })
    );
  });

  await test("client write lastUserUid directly -> deny", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertFails(
      updateDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-unlocked"), {
        lastUserUid: "sup1",
      })
    );
  });

  await test("supervisor create device with valid name -> allow", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertSucceeds(
      setDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-new"), {
        name: "New Tablet",
        platform: "ios",
        model: "iPad",
        createdByUid: "sup1",
        createdAt: Timestamp.now(),
      })
    );
  });

  await test("admin create device with empty platform (naming an unnamed device) -> allow", async () => {
    const db = adminCtx(testEnv).firestore();
    await assertSucceeds(
      setDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-admin-named"), {
        name: "Admin Named Device",
        platform: "",
        model: "",
        createdByUid: "admin1",
        createdAt: Timestamp.now(),
      })
    );
  });

  await test("create device with garbage platform -> deny", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertFails(
      setDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-bad-platform"), {
        name: "Bad Platform",
        platform: "windows",
        model: "",
        createdByUid: "sup1",
        createdAt: Timestamp.now(),
      })
    );
  });

  await test("client delete device -> always deny", async () => {
    const { deleteDoc } = await import("firebase/firestore");
    const db = adminCtx(testEnv).firestore();
    await assertFails(
      deleteDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-unlocked"))
    );
  });

  // --- Name length validation (create + rename) ---

  await test("create device with empty name -> deny", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertFails(
      setDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-empty-name"), {
        name: "",
        platform: "ios",
        model: "iPhone 12",
        createdByUid: "sup1",
        createdAt: Timestamp.now(),
      })
    );
  });

  await test("create device with 25-char name -> deny", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertFails(
      setDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-long-name"), {
        name: "x".repeat(25),
        platform: "ios",
        model: "iPhone 12",
        createdByUid: "sup1",
        createdAt: Timestamp.now(),
      })
    );
  });

  await test("create device with exactly 24-char name -> allow", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertSucceeds(
      setDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-24-char-name"), {
        name: "x".repeat(24),
        platform: "ios",
        model: "iPhone 12",
        createdByUid: "sup1",
        createdAt: Timestamp.now(),
      })
    );
  });

  await test("rename device to empty name -> deny", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertFails(
      updateDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-unlocked"), {
        name: "",
        updatedAt: Timestamp.now(),
        updatedByUid: "sup1",
      })
    );
  });

  await test("rename device to 25-char name -> deny", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertFails(
      updateDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-unlocked"), {
        name: "x".repeat(25),
        updatedAt: Timestamp.now(),
        updatedByUid: "sup1",
      })
    );
  });

  await test("rename device to exactly 24-char name -> allow", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-unlocked"), {
        name: "x".repeat(24),
        updatedAt: Timestamp.now(),
        updatedByUid: "sup1",
      })
    );
  });

  // --- Read/create gating: active-supervisor-or-admin only, per spec ---

  await test("inactive supervisor read devices -> deny", async () => {
    const db = inactiveSupervisorCtx(testEnv).firestore();
    await assertFails(getDocs(collection(db, "companies", COMPANY_ID, "devices")));
  });

  await test("inactive supervisor create device -> deny", async () => {
    const db = inactiveSupervisorCtx(testEnv).firestore();
    await assertFails(
      setDoc(doc(db, "companies", COMPANY_ID, "devices", "dev-by-inactive-sup"), {
        name: "Sneaky Tablet",
        platform: "ios",
        model: "iPad",
        createdByUid: "sup2",
        createdAt: Timestamp.now(),
      })
    );
  });

  await test("plain employee (not supervisor/admin) read devices -> deny", async () => {
    const db = employeeCtx(testEnv).firestore();
    await assertFails(getDocs(collection(db, "companies", COMPANY_ID, "devices")));
  });

  await test("admin read devices -> allow", async () => {
    const db = adminCtx(testEnv).firestore();
    await assertSucceeds(getDocs(collection(db, "companies", COMPANY_ID, "devices")));
  });

  await test("active supervisor read devices -> allow", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertSucceeds(getDocs(collection(db, "companies", COMPANY_ID, "devices")));
  });

  // --- Cross-company isolation ---

  const OTHER_COMPANY_ID = "companyB";
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "companies", OTHER_COMPANY_ID), { planTier: "free" });
    await setDoc(doc(db, "companies", OTHER_COMPANY_ID, "employees", "sup1"), {
      active: true,
      isSupervisor: true,
      name: "Other Co Sup",
    });
  });

  await test("supervisor cannot read another company's devices", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertFails(getDocs(collection(db, "companies", OTHER_COMPANY_ID, "devices")));
  });

  // --- clockEvents byte-for-byte-equivalence spot checks (rules layer only) ---

  await test("clockEvent create with NO deviceId (old app version) -> allow", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertSucceeds(
      addDoc(collection(db, "companies", COMPANY_ID, "clockEvents"), {
        employeeId: "emp1",
        employeeName: "Emp One",
        siteId: null,
        siteName: "Not specified",
        type: "in",
        source: "pin",
        createdByUid: "sup1",
        clientTimestamp: Timestamp.now(),
        timestamp: Timestamp.now(),
        createdAt: Timestamp.now(),
      })
    );
  });

  await test("clockEvent create with garbage deviceId string -> still allowed at rules layer", async () => {
    const db = supervisorCtx(testEnv).firestore();
    await assertSucceeds(
      addDoc(collection(db, "companies", COMPANY_ID, "clockEvents"), {
        employeeId: "emp1",
        employeeName: "Emp One",
        siteId: null,
        siteName: "Not specified",
        type: "in",
        source: "pin",
        createdByUid: "sup1",
        clientTimestamp: Timestamp.now(),
        timestamp: Timestamp.now(),
        createdAt: Timestamp.now(),
        deviceId: "abc/def",
        deviceNameSnapshot: null,
      })
    );
  });

  await test("clockEvent create with deviceId on a non-Pro company -> still allowed at rules layer", async () => {
    // Plan-tier gating for device tracking happens in the Cloud Function
    // (isProPlan check in handleDeviceTracking), not in firestore.rules -
    // the rules layer treats deviceId/deviceNameSnapshot the same
    // regardless of plan, same as the garbage-deviceId case above.
    const db = testEnv
      .authenticatedContext("sup1", {
        role: "supervisor",
        companyId: OTHER_COMPANY_ID,
        employeeId: "sup1",
      })
      .firestore();
    await assertSucceeds(
      addDoc(collection(db, "companies", OTHER_COMPANY_ID, "clockEvents"), {
        employeeId: "sup1",
        employeeName: "Other Co Sup",
        siteId: null,
        siteName: "Not specified",
        type: "in",
        source: "faceMatch",
        createdByUid: "sup1",
        clientTimestamp: Timestamp.now(),
        timestamp: Timestamp.now(),
        createdAt: Timestamp.now(),
        deviceId: "11111111-2222-4333-8444-555555555555",
        deviceNameSnapshot: "Some Device",
      })
    );
  });

  await testEnv.cleanup();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
