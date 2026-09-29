// Device Recognition Pro - ONE-TIME live smoke test against PROD Firestore
// (project orbitworks-7ef59, ShipMate company). Not part of the regular
// test suite - delete this file after use. Requires:
//   1. functions/.env.orbitworks-7ef59 has DEVICE_TRACKING_ENABLED=true
//   2. That's been deployed: firebase deploy --only functions:onClockEventCreated
//   3. `firebase login` credentials with Firestore access on this project
//      (uses Application Default Credentials - no emulator involved).
//
// Creates a clearly-labeled test device doc and one clockEvent attributed
// to a real ShipMate employee (Lucas Peguero - already touched by the
// manual regression-test entry earlier in this session), then polls for
// the device doc to get lastSeenAt/lastUserUid stamped by the deployed
// onClockEventCreated function. Cleans up the device doc and clockEvent
// it created afterward; does NOT revert the employee's lastEventType
// (same precedent as the earlier manual "End Break" regression test).
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const COMPANY_ID = "qdLsh075T743sGEKyZs7"; // ShipMate
const EMPLOYEE_UID = "snP2uS44oWVlFB9keMya"; // Lucas Peguero
const DEVICE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DEVICE_NAME = "TEST DEVICE - Claude smoke test (safe to delete)";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, { timeoutMs = 30000, intervalMs = 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error("timed out waiting for condition");
}

async function main() {
  initializeApp();
  const db = getFirestore();

  const deviceRef = db.collection("companies").doc(COMPANY_ID).collection("devices").doc(DEVICE_ID);

  console.log("Creating test device doc...");
  await deviceRef.set({
    name: DEVICE_NAME,
    platform: "ios",
    model: "Smoke Test",
    createdByUid: EMPLOYEE_UID,
    createdAt: Timestamp.now(),
    locked: false,
  });

  const eventRef = await db
    .collection("companies")
    .doc(COMPANY_ID)
    .collection("clockEvents")
    .add({
      employeeId: EMPLOYEE_UID,
      employeeName: "Lucas Peguero",
      siteId: null,
      siteName: "Not specified",
      type: "out",
      source: "faceMatch",
      createdByUid: EMPLOYEE_UID,
      clientTimestamp: Timestamp.now(),
      timestamp: Timestamp.now(),
      createdAt: Timestamp.now(),
      deviceId: DEVICE_ID,
      deviceNameSnapshot: DEVICE_NAME,
    });
  console.log(`Created clockEvent ${eventRef.id}, waiting for onClockEventCreated to process it...`);

  try {
    const snap = await waitFor(async () => {
      const s = await deviceRef.get();
      return s.data()?.lastSeenAt ? s : null;
    });
    const data = snap.data();
    console.log("SUCCESS: device doc stamped ->", {
      lastSeenAt: data.lastSeenAt.toDate().toISOString(),
      lastUserUid: data.lastUserUid,
    });
    if (data.lastUserUid !== EMPLOYEE_UID) {
      console.log(`WARNING: expected lastUserUid=${EMPLOYEE_UID}, got ${data.lastUserUid}`);
    }
  } catch (err) {
    console.log("FAILED:", err.message);
    console.log("Leaving the test clockEvent and device doc in place for inspection.");
    process.exitCode = 1;
    return;
  }

  console.log("Cleaning up test device doc and clockEvent...");
  await deviceRef.delete();
  await eventRef.delete();
  console.log("Done. (Lucas Peguero's lastEventType is now 'out' - not reverted, same as the earlier manual regression-test entry.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
