import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "./shared";
import { storagePathFromDownloadUrl } from "./rekognition";
import { resolveFaceBadReferenceAlert } from "./alerts";
import { removeEmployeePhotoSchema } from "./facePhotoValidators";

// ---- One employee's face photos (biometric audit c + d) ----
//
// Every reference-type photo of an employee lives under ONE folder:
//   companies/{c}/employees/{e}/reference.jpg      profile / reference photo
//   companies/{c}/employees/{e}/selfie/...         Employee App sign-up originals
//   companies/{c}/employees/{e}/updates/...        supervisor app photo changes
//                                                  (incl. the 30-day retained old one)
// Clock-in/out photos live under companies/{c}/clockEvents/ and are NEVER
// touched here - they follow the 90-day clock photo schedule, and clock
// events / timesheet data are never deleted by anything in this file.
//
// Before this, only the single file photoUrl pointed at was deleted on the
// deactivation and cancellation sweeps, so the Employee App's selfie/ copy
// (identical to the reference photo) outlived both.

export function employeePhotoFolder(companyId: string, employeeId: string): string {
  return `companies/${companyId}/employees/${employeeId}/`;
}

function isNotFound(err: unknown): boolean {
  return (err as { code?: number } | undefined)?.code === 404;
}

// Deletes the file photoUrl points at (only if it is a reference-type path
// inside this company - never a clock photo, never another company's file),
// then the employee's whole photo folder. Throws on a real Storage failure
// so callers decide: the callables surface it (admin retries), the sweeps
// catch it and try again on the next run. A missing file is fine.
export async function deleteEmployeeFacePhotos(
  companyId: string,
  employeeId: string,
  photoUrl?: string | null
): Promise<void> {
  const bucket = admin.storage().bucket();
  const path = photoUrl ? storagePathFromDownloadUrl(photoUrl) : null;
  if (path && path.startsWith(`companies/${companyId}/`) && !path.startsWith(`companies/${companyId}/clockEvents/`)) {
    try {
      await bucket.file(path).delete();
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
  await bucket.deleteFiles({ prefix: employeePhotoFolder(companyId, employeeId) });

  // The retained old photos under updates/ just went with the folder - mark
  // their employeeUpdates records so cleanupRetainedEmployeePhotos doesn't
  // try them again. Best-effort: a miss only means one harmless 404 later.
  try {
    const pending = await db
      .collection("companies")
      .doc(companyId)
      .collection("employeeUpdates")
      .where("employeeId", "==", employeeId)
      .where("retainedPhotoDeletedAt", "==", null)
      .get();
    if (!pending.empty) {
      const batch = db.batch();
      const now = admin.firestore.Timestamp.now();
      for (const d of pending.docs) {
        if (d.get("oldPhotoPath")) batch.update(d.ref, { retainedPhotoDeletedAt: now });
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn("Failed to mark retained photos deleted", { companyId, employeeId, error: String(err) });
  }
}

export type FaceDataDeletedReason = "employeeDeleted" | "photoRemoved" | "accountDeleted";

// The employeeConsents record is kept (it holds no biometric data - it is
// the proof of consent AND of deletion); only stamped. Admin-created
// employees have no record, which is fine.
export async function markConsentFaceDataDeleted(
  companyId: string,
  employeeId: string,
  reason: FaceDataDeletedReason
): Promise<void> {
  const consentRef = db.collection("companies").doc(companyId).collection("employeeConsents").doc(employeeId);
  const consent = await consentRef.get();
  if (!consent.exists) return;
  await consentRef.update({
    faceDataDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
    faceDataDeletedReason: reason,
  });
}

// ---- removeEmployeePhoto (website, admin/owner) - biometric audit c ----
// Deletes the employee's reference photo and every other face photo of
// theirs, and clears photoUrl. With no photoUrl, face checks skip this
// employee (rekognition.ts checkFaceMatch: "no pfp = skipped"), so checks
// are paused until a new photo is added - adding one (Change photo) turns
// them back on. Clock events, their photos and face results are untouched.
export const removeEmployeePhoto = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !companyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }
  const parsed = removeEmployeePhotoSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "employeeId is required.");
  }
  const { employeeId } = parsed.data;

  const employeeRef = db.collection("companies").doc(companyId).collection("employees").doc(employeeId);
  const snap = await employeeRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Employee not found.");
  }
  const photoUrl = (snap.data() as { photoUrl?: string }).photoUrl ?? null;

  try {
    await deleteEmployeeFacePhotos(companyId, employeeId, photoUrl);
  } catch (err) {
    console.error("removeEmployeePhoto: Storage delete failed", { companyId, employeeId, error: String(err) });
    throw new HttpsError("internal", "Couldn't remove the photo. Try again.");
  }

  await employeeRef.update({
    photoUrl: admin.firestore.FieldValue.delete(),
    faceReference: admin.firestore.FieldValue.delete(),
    facePhotoRemovedAt: admin.firestore.FieldValue.serverTimestamp(),
    facePhotoRemovedByUid: request.auth.uid,
  });
  await resolveFaceBadReferenceAlert(companyId, employeeId);
  await markConsentFaceDataDeleted(companyId, employeeId, "photoRemoved");

  return { removed: photoUrl !== null };
});
