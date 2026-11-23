import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db, localDateKey } from "./shared";
import { deriveStatus, type MinimalClockEvent } from "./clockStatus";
import { employeeClaims } from "./employeeAlerts";
import { createAlertIfNew, resolveFaceBadReferenceAlert } from "./alerts";
import { deleteEmployeeFacePhotos, markConsentFaceDataDeleted } from "./facePhotos";
import { employeePinRef, readEmployeePin } from "./lib/employeePin";
import { pinHistoryRef } from "./pins";
import { DELETE_ACCOUNT_OPEN_SHIFT_MESSAGE, deleteMyEmployeeAccountSchema } from "./employeeAccountValidators";

// ---- Employee App "Delete account" (Apple account deletion) - biometric audit b ----
//
// The signed-in employee deletes their own app account from Settings. Same
// on Core and Pro.
//
// Deleted: the Auth login, users/{uid}, the reference photo and every copy
// (sign-up selfie, supervisor-app updates - facePhotos.ts), the PIN (the
// employeePins record, the pins/{pin} reservation, earlier PINs), the push
// token, the employee's own alerts and the per-login PIN counters.
//
// Kept, as the employer's records: the employee row (unlinked and
// deactivated - frees the seat, admin can reactivate it and set a new PIN),
// every clock event with its face result, timesheets, comments, job site
// records, and the employeeConsents record (stamped "accountDeleted" - it
// holds no biometric data and is the proof of consent and of deletion).
// The row gets appAccountDeletedAt, which the website shows as "Deleted app
// account" on the Employees page and on their clock events. Clock photos
// follow the 90-day schedule like everyone else's.
//
// Refused while the employee is clocked in or on a break (decision Q1 B):
// no automatic clock-out. The app also refuses while anything is still
// waiting to sync on the phone (decision Q4 A) - that check is on the phone,
// where the queue lives.
//
// The admin gets a website-only alert (never pushed). The Auth login goes
// last, so a failure anywhere before it leaves the employee signed in to
// try again; a retry after a later failure finishes the job.

const ALERT_BATCH = 400;

async function latestEventType(companyId: string, employeeId: string): Promise<MinimalClockEvent["type"] | undefined> {
  const snap = await db
    .collection("companies")
    .doc(companyId)
    .collection("clockEvents")
    .where("employeeId", "==", employeeId)
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();
  if (snap.empty) return undefined;
  return (snap.docs[0].data() as { type?: MinimalClockEvent["type"] }).type;
}

async function deleteEmployeeAlerts(companyId: string, employeeId: string): Promise<void> {
  const col = db.collection("companies").doc(companyId).collection("employeeAlerts");
  for (;;) {
    const snap = await col.where("employeeId", "==", employeeId).limit(ALERT_BATCH).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < ALERT_BATCH) return;
  }
}

async function deleteLogin(uid: string): Promise<void> {
  await Promise.all([
    db.collection("users").doc(uid).delete(),
    db.collection("pinAttempts").doc(uid).delete(),
    db.collection("pinReveals").doc(uid).delete(),
  ]);
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== "auth/user-not-found") throw err;
  }
}

export const deleteMyEmployeeAccount = onCall(async (request) => {
  const { companyId, employeeId } = employeeClaims(request);
  const uid = request.auth!.uid;
  const parsed = deleteMyEmployeeAccountSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "confirm is required.");
  }

  const employeeRef = db.collection("companies").doc(companyId).collection("employees").doc(employeeId);
  const snap = await employeeRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Employee not found.");
  }
  const employee = snap.data() as {
    name?: string;
    linkedUserId?: string;
    photoUrl?: string;
    pin?: string;
    appAccountDeletedAt?: admin.firestore.Timestamp;
  };

  // A retry after the Firestore part already finished (the Auth delete
  // failed last time): only the login is left to remove.
  if (!employee.linkedUserId && employee.appAccountDeletedAt) {
    await deleteLogin(uid);
    return { deleted: true };
  }
  if (employee.linkedUserId !== uid) {
    throw new HttpsError("permission-denied", "This login isn't linked to this employee.");
  }

  if (deriveStatus(await latestEventType(companyId, employeeId)) !== "out") {
    throw new HttpsError("failed-precondition", DELETE_ACCOUNT_OPEN_SHIFT_MESSAGE);
  }

  try {
    await deleteEmployeeFacePhotos(companyId, employeeId, employee.photoUrl ?? null);
  } catch (err) {
    console.error("deleteMyEmployeeAccount: Storage delete failed", { companyId, employeeId, error: String(err) });
    throw new HttpsError("internal", "Couldn't delete your account. Try again.");
  }

  const pinsCol = db.collection("companies").doc(companyId).collection("pins");
  const currentPin = await readEmployeePin(companyId, employeeId, employee);
  const pinSnap = currentPin ? await pinsCol.doc(currentPin).get() : null;

  const del = admin.firestore.FieldValue.delete();
  const batch = db.batch();
  // Only free the reservation if it is still this employee's.
  if (pinSnap?.exists && (pinSnap.data() as { employeeId?: string | null }).employeeId === employeeId) {
    batch.delete(pinSnap.ref);
  }
  batch.delete(employeePinRef(companyId, employeeId));
  batch.delete(pinHistoryRef(companyId, employeeId));
  batch.delete(db.collection("companies").doc(companyId).collection("employeePushTokens").doc(employeeId));
  batch.update(employeeRef, {
    linkedUserId: del,
    email: del,
    appAccess: del,
    pin: del,
    photoUrl: del,
    faceReference: del,
    active: false,
    // Feeds the normal deactivated-employee schedule (biometricRetention.ts).
    deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
    appAccountDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();

  await deleteEmployeeAlerts(companyId, employeeId);
  await resolveFaceBadReferenceAlert(companyId, employeeId);
  await markConsentFaceDataDeleted(companyId, employeeId, "accountDeleted");

  const name = employee.name?.trim() || "An employee";
  const now = admin.firestore.Timestamp.now();
  try {
    await createAlertIfNew(
      {
        companyId,
        alertType: "employeeAccountDeleted",
        employeeId,
        employeeName: employee.name ?? null,
        siteId: null,
        siteName: null,
        message: `${name} deleted their OrbitsWorks app account. Their photo, selfie and PIN were deleted and they were deactivated. Their clock history stays.`,
        eventId: null,
        employeeUpdateId: null,
        dateKey: localDateKey(now.toDate()),
      },
      now
    );
  } catch (err) {
    console.warn("employeeAccountDeleted alert write failed", { companyId, employeeId, error: String(err) });
  }

  await deleteLogin(uid);
  return { deleted: true };
});
