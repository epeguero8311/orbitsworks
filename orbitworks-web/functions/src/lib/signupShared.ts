import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { db } from "../shared";

// Steps shared by the two Employee App sign-ups: QR (joinCompany.ts) and
// email invite (acceptEmployeeInvite.ts). Each caller keeps its own order,
// test checkpoints and rollback list; only the step bodies live here.

// Delete a Storage file; a missing file is fine.
export async function deleteStorageFile(path: string): Promise<void> {
  try {
    await admin.storage().bucket().file(path).delete();
  } catch (err) {
    if ((err as { code?: number }).code !== 404) throw err;
  }
}

// Save the sign-up selfie bytes (JPEG, already checked by decodeSelfie).
export async function saveSelfieFile(path: string, bytes: Buffer): Promise<void> {
  await admin.storage().bucket().file(path).save(bytes, { contentType: "image/jpeg", resumable: false });
}

// Server-copy the selfie to the profile photo path and give the copy a
// fresh download token. Returns the photoUrl to put on the employee doc.
// Face processing (rekognition.ts) starts only from that photoUrl write,
// so callers set it last, after consent is confirmed.
export async function copySelfieToPhoto(selfiePath: string, photoPath: string): Promise<string> {
  const bucket = admin.storage().bucket();
  const downloadToken = randomUUID();
  await bucket.file(selfiePath).copy(bucket.file(photoPath));
  await bucket.file(photoPath).setMetadata({ contentType: "image/jpeg", metadata: { firebaseStorageDownloadTokens: downloadToken } });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(photoPath)}?alt=media&token=${downloadToken}`;
}

// Give back a PIN reserved for a sign-up that failed: only if it is still
// unclaimed (employeeId null) or held by this same would-be employee.
export async function releaseSignupPin(companyId: string, pin: string, employeeId: string): Promise<void> {
  const pinRef = db.collection("companies").doc(companyId).collection("pins").doc(pin);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(pinRef);
    const holder = snap.exists ? (snap.get("employeeId") as string | null) : undefined;
    if (snap.exists && (holder === null || holder === employeeId)) tx.delete(pinRef);
  });
}

// Plan checks. Duplicated from lib/stripe/tiers.ts (can't import across
// the web/functions boundary), same as the other isProPlan copies.
// Core = legacy tier1-tier5 and core2_tier*; Pro = pro_*. free, custom and
// anything unknown are neither.
export function isProPlan(planTier: string | undefined | null): boolean {
  return !!planTier && planTier.startsWith("pro_");
}

export function isCorePlan(planTier: string | undefined | null): boolean {
  return !!planTier && (/^tier[1-5]$/.test(planTier) || planTier.startsWith("core2_"));
}

export function isCoreOrProPlan(planTier: string | undefined | null): boolean {
  return isProPlan(planTier) || isCorePlan(planTier);
}

// Seat check from LIVE counts (activeEmployeeCount lags a moment). true =
// adding one more active employee would go over a cap. null caps = none.
export function overSeatCaps(
  company: { employeeCap?: number | null; totalEmployeeCap?: number | null } | undefined,
  counts: { active: number; total: number }
): boolean {
  const cap = company?.employeeCap ?? null;
  if (cap !== null && cap - counts.active <= 0) return true;
  const totalCap = company?.totalEmployeeCap ?? null;
  return totalCap !== null && totalCap - counts.total <= 0;
}
