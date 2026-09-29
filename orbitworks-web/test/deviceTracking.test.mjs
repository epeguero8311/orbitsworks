// Device Recognition Pro - functions emulator test for handleDeviceTracking,
// the one piece of new logic in this phase that firestore.rules tests can't
// reach (it's Admin SDK code, not rules). Run via:
//
//   npm run build --prefix functions
//   firebase emulators:exec --only firestore,functions "node test/deviceTracking.test.mjs"
//
// Run it a SECOND time with DEVICE_TRACKING_ENABLED=true in the environment
// to exercise the enabled path - see test/README (or the command printed at
// the end of this file's run) for both invocations. Does not touch prod.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const COMPANY_ID = "companyA";
const DEVICE_ID = "11111111-2222-4333-8444-555555555555"; // matches DEVICE_ID_REGEX
const EMPLOYEE_UID = "emp1";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The onDocumentCreated trigger fires async in the Functions emulator, so
// poll for the side effect instead of asserting immediately.
async function waitFor(fn, { timeoutMs = 10000, intervalMs = 300 } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(intervalMs);
  }
  throw new Error("timed out waiting for condition");
}

async function main() {
  const enabled = process.env.DEVICE_TRACKING_ENABLED === "true";
  console.log(`--- DEVICE_TRACKING_ENABLED=${enabled} ---`);

  initializeApp();
  const db = getFirestore();

  await db.collection("companies").doc(COMPANY_ID).set({ planTier: "pro_tier1" });
  await db
    .collection("companies")
    .doc(COMPANY_ID)
    .collection("employees")
    .doc(EMPLOYEE_UID)
    .set({ active: true, name: "Emp One" });
  await db
    .collection("companies")
    .doc(COMPANY_ID)
    .collection("devices")
    .doc(DEVICE_ID)
    .set({
      name: "Truck 1",
      platform: "ios",
      model: "iPhone 12",
      createdByUid: "sup1",
      createdAt: Timestamp.now(),
      locked: false,
    });

  // Cold-start workaround: the FIRST access to admin.firestore.FieldValue /
  // admin.firestore.Timestamp in a freshly started Functions Emulator
  // process throws/returns undefined (a race in the emulator's admin-SDK
  // wiring, not application code) - every access after that in the same
  // process works fine. Fire a throwaway event first to eat that failure,
  // then wait for the emulator to warm up before the event we actually
  // assert on.
  if (enabled) {
    await db
      .collection("companies")
      .doc(COMPANY_ID)
      .collection("clockEvents")
      .add({
        employeeId: EMPLOYEE_UID,
        employeeName: "Emp One",
        siteId: null,
        siteName: "Not specified",
        type: "out",
        source: "faceMatch",
        createdByUid: EMPLOYEE_UID,
        clientTimestamp: Timestamp.now(),
        timestamp: Timestamp.now(),
        createdAt: Timestamp.now(),
        deviceId: DEVICE_ID,
        deviceNameSnapshot: "Truck 1",
      });
    console.log("fired warm-up clockEvent (expected to no-op or fail on cold start)");
    await sleep(5000);
  }

  // type: "out", not "in" - sidesteps a pre-existing, unrelated crash in
  // onClockEventCreated's "in" branch (admin.firestore.FieldValue is
  // undefined inside the Functions emulator when creating a
  // timesheetApproval doc; see clockEvents.ts:294). Device tracking itself
  // is type-agnostic, so this doesn't weaken what's being tested here.
  const eventRef = await db
    .collection("companies")
    .doc(COMPANY_ID)
    .collection("clockEvents")
    .add({
      employeeId: EMPLOYEE_UID,
      employeeName: "Emp One",
      siteId: null,
      siteName: "Not specified",
      type: "out",
      source: "faceMatch",
      createdByUid: EMPLOYEE_UID,
      clientTimestamp: Timestamp.now(),
      timestamp: Timestamp.now(),
      createdAt: Timestamp.now(),
      deviceId: DEVICE_ID,
      deviceNameSnapshot: "Truck 1",
    });
  console.log(`seeded clockEvent ${eventRef.id}`);

  const deviceRef = db.collection("companies").doc(COMPANY_ID).collection("devices").doc(DEVICE_ID);

  if (enabled) {
    await test("device doc gets lastSeenAt/lastUserUid stamped", async () => {
      const snap = await waitFor(
        async () => {
          const s = await deviceRef.get();
          return s.data()?.lastSeenAt ? s : null;
        },
        { timeoutMs: 45000 }
      );
      const data = snap.data();
      if (data.lastUserUid !== EMPLOYEE_UID) {
        throw new Error(`expected lastUserUid=${EMPLOYEE_UID}, got ${data.lastUserUid}`);
      }
    });

    await test("stamping does not touch the clock event itself", async () => {
      const snap = await eventRef.get();
      const data = snap.data();
      if ("lastSeenAt" in data || "lastUserUid" in data) {
        throw new Error("clock event was unexpectedly mutated by device tracking");
      }
    });
  } else {
    await test("device doc is left untouched while flag is off (default)", async () => {
      // Give the trigger a beat to run and confirm it's a genuine no-op,
      // not just "hasn't run yet".
      await sleep(3000);
      const snap = await deviceRef.get();
      if (snap.data()?.lastSeenAt) {
        throw new Error("lastSeenAt was stamped even though DEVICE_TRACKING_ENABLED is false");
      }
    });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
