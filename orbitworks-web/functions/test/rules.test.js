// Firestore rules tests for the alerts/pushTokens additions (Phase 3).
// Run against the real Firestore emulator (no mocking of rules
// evaluation) via @firebase/rules-unit-testing.
//
// Usage: start `firebase emulators:start --only firestore` first, then
// `node --test test/rules.test.js` from functions/.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { setDoc, doc, updateDoc, getDoc, collection, getDocs } = require("firebase/firestore");

const COMPANY_A = "companyA";
const COMPANY_B = "companyB";

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "orbitworks-rules-test",
    firestore: {
      host: "localhost",
      port: 8080,
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
    await setDoc(doc(db, "companies", COMPANY_A), { name: "Company A" });
    await setDoc(doc(db, "companies", COMPANY_B), { name: "Company B" });
    await setDoc(doc(db, "companies", COMPANY_A, "alerts", "late-emp1-2026-01-01"), {
      companyId: COMPANY_A,
      alertType: "lateClockIn",
      employeeId: "emp1",
      employeeName: "Jordan",
      siteId: null,
      siteName: null,
      message: "Jordan clocked in 10m late.",
      severity: "warning",
      eventId: "evt1",
      dateKey: "2026-01-01",
      readByDeviceIds: ["device-existing"],
    });
    // Face Verification (Pro) rules tests below need a real active
    // employee (isActiveOrClosingOpenSession does a get() on this doc)
    // and a pre-existing clockEvent to update.
    await setDoc(doc(db, "companies", COMPANY_A, "employees", "emp1"), {
      name: "Jordan",
      active: true,
      assignedSiteIds: [],
      pin: "1234",
    });
    await setDoc(doc(db, "companies", COMPANY_A, "clockEvents", "evt1"), {
      employeeId: "emp1",
      employeeName: "Jordan",
      siteId: null,
      siteName: "Not specified",
      type: "in",
      source: "pin",
      createdByUid: "admin-uid",
    });
  });
});

function adminContext() {
  return testEnv.authenticatedContext("admin-uid", {
    companyId: COMPANY_A,
    role: "admin",
  });
}

function crossCompanyContext() {
  return testEnv.authenticatedContext("other-uid", {
    companyId: COMPANY_B,
    role: "admin",
  });
}

test("client cannot create an alert doc", async () => {
  const db = adminContext().firestore();
  await assertFails(
    setDoc(doc(db, "companies", COMPANY_A, "alerts", "fake-alert"), {
      companyId: COMPANY_A,
      alertType: "lateClockIn",
      employeeId: "emp2",
      employeeName: "Fake",
      siteId: null,
      siteName: null,
      message: "forged",
      severity: "warning",
      eventId: null,
      dateKey: "2026-01-01",
      readByDeviceIds: [],
    })
  );
});

test("client cannot modify an alert's content", async () => {
  const db = adminContext().firestore();
  await assertFails(
    updateDoc(doc(db, "companies", COMPANY_A, "alerts", "late-emp1-2026-01-01"), {
      message: "tampered message",
    })
  );
});

test("client can update its own device's read state (append only)", async () => {
  const db = adminContext().firestore();
  await assertSucceeds(
    updateDoc(doc(db, "companies", COMPANY_A, "alerts", "late-emp1-2026-01-01"), {
      readByDeviceIds: ["device-existing", "device-mine"],
    })
  );
  let readBack;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), "companies", COMPANY_A, "alerts", "late-emp1-2026-01-01"));
    readBack = snap.data();
  });
  assert.deepEqual(readBack.readByDeviceIds, ["device-existing", "device-mine"]);
});

test("client cannot remove or alter another device's read state", async () => {
  const db = adminContext().firestore();
  // Drops the existing entry instead of appending - must be denied.
  await assertFails(
    updateDoc(doc(db, "companies", COMPANY_A, "alerts", "late-emp1-2026-01-01"), {
      readByDeviceIds: ["device-mine"],
    })
  );
});

test("client cannot read another company's alerts", async () => {
  const db = crossCompanyContext().firestore();
  await assertFails(getDoc(doc(db, "companies", COMPANY_A, "alerts", "late-emp1-2026-01-01")));
});

// Bonus coverage for pushTokens (built alongside alerts in Phase 3).
test("a device can create its own push token doc", async () => {
  const db = adminContext().firestore();
  await assertSucceeds(
    setDoc(doc(db, "companies", COMPANY_A, "pushTokens", "device-mine"), {
      deviceId: "device-mine",
      token: "ExponentPushToken[abc123]",
      platform: "ios",
      notificationsEnabled: true,
    })
  );
});

test("a device cannot create a push token doc under another company", async () => {
  const db = crossCompanyContext().firestore();
  await assertFails(
    setDoc(doc(db, "companies", COMPANY_A, "pushTokens", "device-mine"), {
      deviceId: "device-mine",
      token: "ExponentPushToken[abc123]",
      platform: "ios",
      notificationsEnabled: true,
    })
  );
});

test("a same-company client can read a push token doc (needed to preserve its own preference on re-registration)", async () => {
  const db = adminContext().firestore();
  await testEnv.withSecurityRulesDisabled(async (context) =>
    setDoc(doc(context.firestore(), "companies", COMPANY_A, "pushTokens", "device-mine"), {
      deviceId: "device-mine",
      token: "ExponentPushToken[abc123]",
      platform: "ios",
      notificationsEnabled: true,
    })
  );
  await assertSucceeds(getDoc(doc(db, "companies", COMPANY_A, "pushTokens", "device-mine")));
});

test("a same-company client cannot list push tokens (would let it enumerate other devices' ids)", async () => {
  const db = adminContext().firestore();
  await testEnv.withSecurityRulesDisabled(async (context) =>
    setDoc(doc(context.firestore(), "companies", COMPANY_A, "pushTokens", "device-other"), {
      deviceId: "device-other",
      token: "ExponentPushToken[xyz789]",
      platform: "ios",
      notificationsEnabled: true,
    })
  );
  await assertFails(getDocs(collection(db, "companies", COMPANY_A, "pushTokens")));
});

test("a cross-company client cannot read a push token doc", async () => {
  const db = crossCompanyContext().firestore();
  await testEnv.withSecurityRulesDisabled(async (context) =>
    setDoc(doc(context.firestore(), "companies", COMPANY_A, "pushTokens", "device-mine"), {
      deviceId: "device-mine",
      token: "ExponentPushToken[abc123]",
      platform: "ios",
      notificationsEnabled: true,
    })
  );
  await assertFails(getDoc(doc(db, "companies", COMPANY_A, "pushTokens", "device-mine")));
});

test("no client can delete a push token doc", async () => {
  const db = adminContext().firestore();
  await testEnv.withSecurityRulesDisabled(async (context) =>
    setDoc(doc(context.firestore(), "companies", COMPANY_A, "pushTokens", "device-mine"), {
      deviceId: "device-mine",
      token: "ExponentPushToken[abc123]",
      platform: "ios",
      notificationsEnabled: true,
    })
  );
  const { deleteDoc } = require("firebase/firestore");
  await assertFails(deleteDoc(doc(db, "companies", COMPANY_A, "pushTokens", "device-mine")));
});

// Face Verification (Pro) - faceCheck (clockEvents) and faceReference/
// faceStatus (employees) are all server-written only, by functions/src/
// rekognition.ts (Admin SDK, bypasses rules entirely) - see the comments
// on both match blocks in firestore.rules.
const FAKE_FACE_CHECK = {
  status: "match",
  similarity: 99,
  threshold: 90,
  referencePhotoUrl: "https://example.com/ref.jpg",
  facesInTarget: 1,
  checkedAt: new Date(),
};
const FAKE_FACE_REFERENCE = {
  status: "bad",
  photoUrl: "https://example.com/ref.jpg",
  reason: "noFace",
  flaggedAt: new Date(),
};

test("client cannot create a clockEvent with faceCheck set", async () => {
  const db = adminContext().firestore();
  await assertFails(
    setDoc(doc(db, "companies", COMPANY_A, "clockEvents", "evt-forged"), {
      employeeId: "emp1",
      employeeName: "Jordan",
      siteId: null,
      siteName: "Not specified",
      type: "in",
      source: "pin",
      createdByUid: "admin-uid",
      faceCheck: FAKE_FACE_CHECK,
    })
  );
});

test("client cannot add faceCheck to an existing clockEvent via update", async () => {
  const db = adminContext().firestore();
  await assertFails(
    updateDoc(doc(db, "companies", COMPANY_A, "clockEvents", "evt1"), {
      faceCheck: FAKE_FACE_CHECK,
    })
  );
});

test("client can still update a clockEvent's ordinary fields normally", async () => {
  const db = adminContext().firestore();
  await assertSucceeds(
    updateDoc(doc(db, "companies", COMPANY_A, "clockEvents", "evt1"), {
      note: "Adjusted via admin note",
    })
  );
});

test("client cannot create an employee doc with faceReference set", async () => {
  const db = adminContext().firestore();
  await assertFails(
    setDoc(doc(db, "companies", COMPANY_A, "employees", "emp-forged-ref"), {
      name: "Forged",
      active: false,
      assignedSiteIds: [],
      pin: "0000",
      faceReference: FAKE_FACE_REFERENCE,
    })
  );
});

test("client cannot create an employee doc with faceStatus set", async () => {
  const db = adminContext().firestore();
  await assertFails(
    setDoc(doc(db, "companies", COMPANY_A, "employees", "emp-forged-status"), {
      name: "Forged",
      active: false,
      assignedSiteIds: [],
      pin: "0000",
      faceStatus: "enrolled",
    })
  );
});

test("client cannot add faceReference to an existing employee via update", async () => {
  const db = adminContext().firestore();
  await assertFails(
    updateDoc(doc(db, "companies", COMPANY_A, "employees", "emp1"), {
      faceReference: FAKE_FACE_REFERENCE,
    })
  );
});
