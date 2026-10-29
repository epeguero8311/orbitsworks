// Firestore rules tests for the alerts/pushTokens additions (Phase 3).
// Run against the real Firestore emulator (no mocking of rules
// evaluation) via @firebase/rules-unit-testing.
//
// Usage: start `firebase emulators:start --only firestore` first, then
// `node --test test/rules.test.js` from functions/. Port must match
// firebase.json's emulators.firestore.port.
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

// Guards the faceStatus/faceReference denylist added to the create rule -
// in the real app every employee create actually goes through an Admin
// SDK callable (addEmployee/createEmployee/acceptInvite), which bypasses
// rules entirely, so this doesn't reflect any live client flow. It's here
// to confirm the new denylist didn't also break a direct client create of
// an ordinary employee doc, should one ever be added.
test("client can still create an ordinary employee doc (no face fields)", async () => {
  const db = adminContext().firestore();
  await assertSucceeds(
    setDoc(doc(db, "companies", COMPANY_A, "employees", "emp-ordinary"), {
      name: "Ordinary",
      active: false,
      assignedSiteIds: [],
      pin: "9999",
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

// Face Verification (Pro) company-settings toggle - checks themselves
// always run for Pro with no opt-out; alertsEnabled is the only remaining
// knob and it's Pro-only, in both directions (no "always allowed to turn
// off" exception anymore - see firestore.rules). COMPANY_A has no planTier
// set in beforeEach (defaults to Core), so it doubles as the "not Pro"
// fixture here.
test("Core company admin cannot write faceVerification.alertsEnabled", async () => {
  const db = adminContext().firestore();
  await assertFails(
    updateDoc(doc(db, "companies", COMPANY_A), {
      faceVerification: { alertsEnabled: false },
    })
  );
});

test("Pro company admin can write faceVerification.alertsEnabled", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "companies", COMPANY_A), {
      name: "Company A",
      planTier: "pro_tier1",
    });
  });
  const db = adminContext().firestore();
  await assertSucceeds(
    updateDoc(doc(db, "companies", COMPANY_A), {
      faceVerification: { alertsEnabled: false },
    })
  );
});

test("client still cannot change planTier itself even to unlock faceVerification.alertsEnabled", async () => {
  const db = adminContext().firestore();
  await assertFails(
    updateDoc(doc(db, "companies", COMPANY_A), {
      planTier: "pro_tier1",
      faceVerification: { alertsEnabled: false },
    })
  );
});

// Sync speed step 3 (mobile doc-first, photo-after). No rules change -
// these pin down that the new mobile write sequence passes the EXISTING
// create rule + isIdempotentReplay, and that it didn't loosen anything.
// Writes are setDoc(..., { merge: true }) exactly like queueSync.js.
const SUP_UID = "sup-uid";
async function seedSupervisor() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "companies", COMPANY_A, "employees", "sup-emp"), {
      name: "Sam Supervisor",
      active: true,
      isSupervisor: true,
      assignedSiteIds: [],
    });
  });
}
function supervisorContext(uid = SUP_UID, employeeId = "sup-emp") {
  return testEnv.authenticatedContext(uid, { companyId: COMPANY_A, role: "supervisor", employeeId });
}
function docFirstPayload(localId) {
  return {
    localId,
    employeeId: "emp1",
    employeeName: "Jordan",
    siteId: null,
    siteName: "Not specified",
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
    createdByUid: SUP_UID,
    clientTimestamp: new Date("2026-10-29T14:00:00Z"),
    timestamp: new Date("2026-10-29T14:00:00Z"),
    createdAt: new Date("2026-10-29T14:00:00Z"),
  };
}
const PHOTO_URL = "https://firebasestorage.googleapis.com/v0/b/x/o/companies%2FcompanyA%2FclockEvents%2Femp1%2Fl1.jpg?alt=media&token=t";

test("doc-first: supervisor creates clockEvent with photoPending and no photoUrl", async () => {
  await seedSupervisor();
  const db = supervisorContext().firestore();
  await assertSucceeds(setDoc(doc(db, "companies", COMPANY_A, "clockEvents", "l1"), docFirstPayload("l1"), { merge: true }));
});

test("doc-first: same supervisor merges { photoUrl, photoPending:false } afterwards", async () => {
  await seedSupervisor();
  const db = supervisorContext().firestore();
  const ref = doc(db, "companies", COMPANY_A, "clockEvents", "l1");
  await assertSucceeds(setDoc(ref, docFirstPayload("l1"), { merge: true }));
  await assertSucceeds(setDoc(ref, { photoUrl: PHOTO_URL, photoPending: false }, { merge: true }));
});

test("doc-first: replaying the doc payload after the photo landed keeps photoUrl", async () => {
  await seedSupervisor();
  const db = supervisorContext().firestore();
  const ref = doc(db, "companies", COMPANY_A, "clockEvents", "l1");
  await assertSucceeds(setDoc(ref, docFirstPayload("l1"), { merge: true }));
  await assertSucceeds(setDoc(ref, { photoUrl: PHOTO_URL, photoPending: false }, { merge: true }));
  await assertSucceeds(setDoc(ref, docFirstPayload("l1"), { merge: true }));
  const snap = await getDoc(ref);
  assert.equal(snap.data().photoUrl, PHOTO_URL);
});

test("doc-first: supervisor can flag a lost photo with { photoPending:false, photoMissing:true }", async () => {
  await seedSupervisor();
  const db = supervisorContext().firestore();
  const ref = doc(db, "companies", COMPANY_A, "clockEvents", "l1");
  await assertSucceeds(setDoc(ref, docFirstPayload("l1"), { merge: true }));
  await assertSucceeds(setDoc(ref, { photoPending: false, photoMissing: true }, { merge: true }));
});

test("doc-first: a DIFFERENT supervisor cannot attach a photo (isIdempotentReplay unchanged)", async () => {
  await seedSupervisor();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "companies", COMPANY_A, "employees", "sup2-emp"), {
      name: "Other Supervisor",
      active: true,
      isSupervisor: true,
    });
  });
  await assertSucceeds(
    setDoc(doc(supervisorContext().firestore(), "companies", COMPANY_A, "clockEvents", "l1"), docFirstPayload("l1"), { merge: true })
  );
  const other = supervisorContext("sup2-uid", "sup2-emp").firestore();
  await assertFails(
    setDoc(doc(other, "companies", COMPANY_A, "clockEvents", "l1"), { photoUrl: PHOTO_URL, photoPending: false }, { merge: true })
  );
});

test("doc-first: supervisor still cannot set faceCheck alongside the photo merge", async () => {
  await seedSupervisor();
  const db = supervisorContext().firestore();
  const ref = doc(db, "companies", COMPANY_A, "clockEvents", "l1");
  await assertSucceeds(setDoc(ref, docFirstPayload("l1"), { merge: true }));
  await assertFails(setDoc(ref, { photoUrl: PHOTO_URL, photoPending: false, faceCheck: FAKE_FACE_CHECK }, { merge: true }));
});

test("old app versions: create with photoUrl in the same write still succeeds", async () => {
  await seedSupervisor();
  const db = supervisorContext().firestore();
  const { photoPending, ...oldPayload } = docFirstPayload("l-old");
  void photoPending;
  await assertSucceeds(
    setDoc(doc(db, "companies", COMPANY_A, "clockEvents", "l-old"), { ...oldPayload, photoUrl: PHOTO_URL }, { merge: true })
  );
});

test("faceCheckClaims is server-only: clients can neither read nor write it", async () => {
  const db = adminContext().firestore();
  await assertFails(setDoc(doc(db, "companies", COMPANY_A, "faceCheckClaims", "l1"), { claimedAt: new Date() }));
  await assertFails(getDoc(doc(db, "companies", COMPANY_A, "faceCheckClaims", "l1")));
});
