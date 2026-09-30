import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "./shared";

// Mirrors orbitworks-app/lib/validators/createEmployee.js's JUNK_PINS - keep
// both in sync by hand (no shared package across the app/web boundary, same
// convention as isProPlan/FREE_EMPLOYEE_CAP elsewhere in this file's siblings).
const JUNK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "0123", "1212", "2580",
]);

const NAME_MAX_LENGTH = 100;
// Shape of a client-generated Firestore auto-ID (doc(collection(...)).id) -
// see employeeQueue.js on the app side for where this is created.
const EMPLOYEE_ID_REGEX = /^[A-Za-z0-9_-]{10,40}$/;

function requireCreatorAuth(request: { auth?: { uid: string; token: Record<string, unknown> } }): {
  companyId: string;
  uid: string;
} {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  if (!companyId || (role !== "admin" && role !== "owner" && role !== "supervisor")) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }
  return { companyId, uid: request.auth.uid };
}

// Same transactional reservation primitive as reserveNewPin (pins.ts) - doc
// ID as the lock, so two concurrent calls can never both win the same PIN -
// but tries the caller's own on-device guess first (so the PIN already shown
// to the person offline usually survives sync unchanged), and skips the
// junk list entirely for both that guess and every fallback candidate.
async function reserveNonJunkPin(companyId: string, clientPin: string | null): Promise<string> {
  const pinsRef = db.collection("companies").doc(companyId).collection("pins");
  const maxAttempts = 20;

  const tryCandidate = async (candidate: string): Promise<boolean> => {
    const candidateRef = pinsRef.doc(candidate);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(candidateRef);
      if (snap.exists) return false;
      tx.set(candidateRef, { employeeId: null, updatedAt: admin.firestore.Timestamp.now() });
      return true;
    });
  };

  if (clientPin && /^\d{4}$/.test(clientPin) && !JUNK_PINS.has(clientPin)) {
    if (await tryCandidate(clientPin)) return clientPin;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let candidate: string;
    do {
      candidate = Math.floor(1000 + Math.random() * 9000).toString();
    } while (JUNK_PINS.has(candidate));
    if (await tryCandidate(candidate)) return candidate;
  }

  throw new HttpsError("resource-exhausted", "Could not generate a unique PIN. Try again.");
}

// Creates an employee from the mobile app (supervisors and admins, gated by
// companies/{id}.appSettings.allowAppEmployeeCreate) - the future face
// enrollment step reads faceStatus: "not_enrolled" off newly created
// employees and flips it once AWS Rekognition enrolls their reference photo.
//
// employeeId and photoUrl are supplied by the caller instead of generated
// here: the client (lib/employeeQueue.js) generates the doc ID locally,
// uploads the photo straight to Storage at that ID's path, and only then
// calls this function - so the PIN reservation and the Firestore doc write
// land in one atomic batch, exactly like addEmployee's pattern, with no
// separate "link the photo afterward" step or rollback callable needed. A
// failure between the Storage upload and this call succeeding just leaves
// an orphaned Storage blob (same accepted risk clock-in photos already
// have in queueSync.js) - the local queue retries this same call until the
// employee doc actually exists.
export const createEmployee = onCall(async (request) => {
  const { companyId, uid } = requireCreatorAuth(request);

  const data = request.data ?? {};
  const employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const photoUrl = typeof data.photoUrl === "string" ? data.photoUrl.trim() : "";
  const clientPin =
    data.clientPin !== undefined && data.clientPin !== null ? String(data.clientPin).trim() : null;

  if (!EMPLOYEE_ID_REGEX.test(employeeId)) {
    throw new HttpsError("invalid-argument", "Invalid employeeId.");
  }
  if (!name || name.length > NAME_MAX_LENGTH) {
    throw new HttpsError("invalid-argument", "A valid name is required.");
  }
  if (!photoUrl) {
    throw new HttpsError("invalid-argument", "A reference photo is required.");
  }
  // Confirms the URL actually points at THIS employee's own reference photo
  // path rather than an arbitrary URL, so a forged photoUrl can't get linked
  // to someone else's employee record.
  const expectedPathFragment = encodeURIComponent(
    `companies/${companyId}/employees/${employeeId}/reference.jpg`
  );
  if (!photoUrl.includes(expectedPathFragment)) {
    throw new HttpsError("invalid-argument", "photoUrl does not match the expected path.");
  }

  const companyRef = db.collection("companies").doc(companyId);
  const employeeRef = companyRef.collection("employees").doc(employeeId);

  const existingSnap = await employeeRef.get();
  if (existingSnap.exists) {
    // Idempotent replay: the same caller retrying after an earlier attempt's
    // response never reached the device (app kill, dropped connection right
    // after the batch committed below) - see employeeQueueSync.js's
    // retry-safe-by-employeeId design. Never replays for a different caller
    // or a genuinely different employee that happens to reuse this ID (an
    // astronomically unlikely random-ID collision) - both fall through as
    // 'already-exists' instead.
    const existing = existingSnap.data() as { createdByUid?: string; name?: string; pin?: string };
    if (existing.createdByUid === uid && existing.name === name) {
      return {
        employeeId,
        pin: existing.pin,
        pinChanged: clientPin != null && existing.pin !== clientPin,
      };
    }
    throw new HttpsError("already-exists", "Employee already exists.");
  }

  const companySnap = await companyRef.get();
  const company = companySnap.data() as
    | {
        appSettings?: { allowAppEmployeeCreate?: boolean };
        employeeCap?: number | null;
        activeEmployeeCount?: number;
        subscriptionStatus?: string;
      }
    | undefined;

  if (company?.appSettings?.allowAppEmployeeCreate === false) {
    throw new HttpsError("failed-precondition", "Creating employees from the app is turned off.");
  }
  if (company?.subscriptionStatus === "past_due") {
    throw new HttpsError("failed-precondition", "Subscription is past due.");
  }
  const cap = company?.employeeCap ?? null;
  const currentCount = company?.activeEmployeeCount ?? 0;
  if (cap !== null && currentCount >= cap) {
    throw new HttpsError("resource-exhausted", "This company has reached its employee limit.");
  }

  const pin = await reserveNonJunkPin(companyId, clientPin);

  const batch = db.batch();
  batch.set(employeeRef, {
    name,
    photoUrl,
    active: true,
    faceStatus: "not_enrolled",
    assignedSiteIds: [],
    pin,
    createdByUid: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(
    companyRef.collection("pins").doc(pin),
    { employeeId, updatedAt: admin.firestore.Timestamp.now() },
    { merge: true }
  );
  await batch.commit();

  return { employeeId, pin, pinChanged: clientPin != null && pin !== clientPin };
});
