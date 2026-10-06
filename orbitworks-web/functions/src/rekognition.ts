import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { RekognitionClient, CompareFacesCommand, DetectFacesCommand } from "@aws-sdk/client-rekognition";
import { db } from "./shared";
import { createFaceMismatchAlert, createFaceNoFaceAlert, createOrKeepFaceBadReferenceAlert, resolveFaceBadReferenceAlert } from "./alerts";

// Bind into the `secrets` array of any function that calls Rekognition -
// onClockEventCreated, reassignClockEvent, and this file's own trigger -
// mirroring geocoding.ts's MAPBOX_TOKEN. The emulator reads these from
// functions/.secret.local.
export const REKOGNITION_ACCESS_KEY_ID = defineSecret("REKOGNITION_ACCESS_KEY_ID");
export const REKOGNITION_SECRET_ACCESS_KEY = defineSecret("REKOGNITION_SECRET_ACCESS_KEY");

const REKOGNITION_REGION = "us-east-1";
export const FACE_MATCH_THRESHOLD = 90;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Duplicated from lib/stripe/tiers.ts's isProPlan (can't import across the
// functions/web package boundary) - same convention geocoding.ts/
// clockEvents.ts/tempClockLinks.ts already use.
function isProPlan(planTier: string | undefined | null): boolean {
  return !!planTier && planTier.startsWith("pro_");
}

// Created inside each handler, never at module scope - secrets are only
// readable once the function is actually invoked with them bound.
function getRekognitionClient(): RekognitionClient {
  return new RekognitionClient({
    region: REKOGNITION_REGION,
    credentials: {
      accessKeyId: REKOGNITION_ACCESS_KEY_ID.value(),
      secretAccessKey: REKOGNITION_SECRET_ACCESS_KEY.value(),
    },
  });
}

// Clock event / employee photoUrl are both Firebase Storage download URLs
// (https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded-path>
// ?alt=media&token=...), never a bare Storage path - confirmed against
// queueSync.js, tempClockLinks.ts, and createEmployee.ts, which all build
// exactly this shape. Pulls the object path back out of the `/o/<encoded>`
// segment so the Admin SDK can download the bytes directly instead of
// making an authenticated HTTP request to the download URL itself.
function storagePathFromDownloadUrl(url: string): string | null {
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

// Best-effort only - every failure path (bad path, download error, too
// large) returns null rather than throwing, so a bad image can never
// block the clock event or the pfp write it's checking.
async function downloadImage(path: string, context: Record<string, unknown>): Promise<Buffer | null> {
  try {
    const bucket = admin.storage().bucket();
    const [buffer] = await bucket.file(path).download();
    if (buffer.length > MAX_IMAGE_BYTES) {
      console.warn("Face check image too large, skipping", { ...context, path, bytes: buffer.length });
      return null;
    }
    return buffer;
  } catch (err) {
    console.warn("Face check image download failed", { ...context, path, error: String(err) });
    return null;
  }
}

type FaceVerificationCompany = {
  planTier?: string;
};

// Face checks are always on for Pro, never for Core - there is no company
// opt-out anymore (see FACE_VERIFICATION_SPEC.md). The only remaining
// company-level knob, faceVerification.alertsEnabled, controls whether
// faceMismatch/faceNoFace alerts fire - that's read separately, in
// alerts.ts's getCompanyAlertContext, not here.
async function isProCompany(companyId: string): Promise<boolean> {
  const companySnap = await db.collection("companies").doc(companyId).get();
  const company = companySnap.data() as FaceVerificationCompany | undefined;
  return !!company && isProPlan(company.planTier);
}

type ClockEventFaceData = {
  photoUrl?: string;
  faceCheck?: unknown;
  employeeId?: string;
  employeeName?: string;
  timestamp?: admin.firestore.Timestamp;
};

type EmployeeFaceData = {
  photoUrl?: string;
  faceReference?: { status?: string; photoUrl?: string };
};

// Server-only. Verifies a clock event's photo against the employee's
// reference pfp with Rekognition CompareFaces (1:1) - a mismatch never
// blocks the clock event; every failure path below resolves without
// rethrowing (logged via console.warn), so a bad photo, a slow AWS call,
// or a missing secret can never fail the clock event this runs after.
// Re-fetches the clock event and employee itself rather than trusting a
// caller-passed snapshot, so this is safe to call both from
// onClockEventCreated (fresh data) and directly from reassignClockEvent
// (after it deletes the stale faceCheck for the new employee - see
// clockEvents.ts's 6.6 comment for why that call can't just rely on a
// trigger re-firing).
export async function checkFaceMatch(companyId: string, eventId: string): Promise<void> {
  try {
    const eventRef = db.collection("companies").doc(companyId).collection("clockEvents").doc(eventId);
    const eventSnap = await eventRef.get();
    const data = eventSnap.data() as ClockEventFaceData | undefined;
    if (!data || !data.photoUrl || data.faceCheck) return;

    if (!(await isProCompany(companyId))) return;

    const employeeId = data.employeeId;
    if (!employeeId) return;
    const employeeRef = db.collection("companies").doc(companyId).collection("employees").doc(employeeId);
    const employeeSnap = await employeeRef.get();
    const employee = employeeSnap.data() as EmployeeFaceData | undefined;
    if (!employee?.photoUrl) return;
    if (employee.faceReference?.status === "bad" && employee.faceReference.photoUrl === employee.photoUrl) {
      return;
    }

    const referencePath = storagePathFromDownloadUrl(employee.photoUrl);
    const targetPath = storagePathFromDownloadUrl(data.photoUrl);
    if (!referencePath || !targetPath) {
      console.warn("Face check: could not parse a Storage path from photoUrl", { companyId, eventId });
      return;
    }

    const [referenceBytes, targetBytes] = await Promise.all([
      downloadImage(referencePath, { companyId, eventId, employeeId }),
      downloadImage(targetPath, { companyId, eventId, employeeId }),
    ]);
    if (!referenceBytes || !targetBytes) return;

    const client = getRekognitionClient();
    let result;
    try {
      result = await client.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: referenceBytes },
          TargetImage: { Bytes: targetBytes },
          SimilarityThreshold: 0,
        })
      );
    } catch (err) {
      const name = (err as { name?: string } | undefined)?.name;
      if (name === "InvalidParameterException") {
        // Source image (the pfp) has no detectable face - flag the
        // employee's reference, never the clock event. No faceCheck is
        // written in this branch, so a later clock event for this
        // employee naturally retries once the pfp is replaced (the
        // faceReference guard above is what keeps that retry cheap -
        // $0 until the photoUrl actually changes).
        await employeeRef.update({
          faceReference: {
            status: "bad",
            photoUrl: employee.photoUrl,
            reason: name,
            flaggedAt: admin.firestore.Timestamp.now(),
          },
        });
        await createOrKeepFaceBadReferenceAlert(companyId, employeeId, data.employeeName ?? "An employee");
        return;
      }
      console.warn("Face check: CompareFaces failed", { companyId, eventId, employeeId, error: String(err) });
      return;
    }

    const faceMatches = result.FaceMatches ?? [];
    const unmatchedFaces = result.UnmatchedFaces ?? [];
    const facesInTarget = faceMatches.length + unmatchedFaces.length;
    const checkedAt = admin.firestore.Timestamp.now();
    const referencePhotoUrl = employee.photoUrl;

    if (facesInTarget === 0) {
      await eventRef.update({
        faceCheck: {
          status: "noFace",
          similarity: null,
          threshold: FACE_MATCH_THRESHOLD,
          referencePhotoUrl,
          facesInTarget: 0,
          checkedAt,
        },
      });
      console.info("Face check", { companyId, eventId, employeeId, status: "noFace" });
      await createFaceNoFaceAlert(companyId, eventId, employeeId, data.employeeName ?? "An employee", data.timestamp ?? null);
      return;
    }

    const best = Math.max(0, ...faceMatches.map((m) => m.Similarity ?? 0));
    const similarity = Math.round(best * 10) / 10;
    const status = best >= FACE_MATCH_THRESHOLD ? "match" : "mismatch";

    await eventRef.update({
      faceCheck: {
        status,
        similarity,
        threshold: FACE_MATCH_THRESHOLD,
        referencePhotoUrl,
        facesInTarget,
        checkedAt,
      },
    });
    console.info("Face check", { companyId, eventId, employeeId, status, similarity });

    if (status === "mismatch") {
      await createFaceMismatchAlert(companyId, eventId, employeeId, data.employeeName ?? "An employee", similarity, data.timestamp ?? null);
    }
  } catch (err) {
    console.warn("Face check failed", { companyId, eventId, error: String(err) });
  }
}

// Face Verification (Pro) reference-photo check. onDocumentWritten, not
// onDocumentCreated - photoUrl CAN be set at doc creation (the mobile
// Create Employee flow's createEmployee.ts writes it in the same
// batch.set that creates the doc), not just via a later update (the web
// Add Employee flow's AddEmployeeForm.tsx uploads the photo and updates
// photoUrl onto an already-created doc) - so this needs to react to both.
// Runs DetectFaces against just the pfp (never CompareFaces - there's no
// clock photo to compare here) whenever photoUrl changed and is now
// non-empty; clears/resolves the flag whenever photoUrl was removed
// entirely. Isolated in its own try/catch, same reasoning as
// checkFaceMatch - never blocks the employee write it ran after.
export const onEmployeePhotoWrite = onDocumentWritten(
  {
    document: "companies/{companyId}/employees/{employeeId}",
    secrets: [REKOGNITION_ACCESS_KEY_ID, REKOGNITION_SECRET_ACCESS_KEY],
  },
  async (event) => {
    const companyId = event.params.companyId;
    const employeeId = event.params.employeeId;
    const after = event.data?.after;
    if (!after?.exists) return; // employee doc deleted - nothing to check or clear

    try {
      const before = event.data?.before?.data() as { photoUrl?: string } | undefined;
      const afterData = after.data() as
        | { photoUrl?: string; name?: string; faceReference?: unknown }
        | undefined;
      if (!afterData) return;

      const beforePhotoUrl = before?.photoUrl;
      const afterPhotoUrl = afterData.photoUrl;
      if (beforePhotoUrl === afterPhotoUrl) return; // unrelated field changed

      const employeeRef = after.ref;

      if (!afterPhotoUrl) {
        // No pfp = checks silently skipped for them - same treatment as
        // the main check's "employee has no pfp" guard.
        if (afterData.faceReference) {
          await employeeRef.update({ faceReference: admin.firestore.FieldValue.delete() });
        }
        await resolveFaceBadReferenceAlert(companyId, employeeId);
        return;
      }

      if (!(await isProCompany(companyId))) return;

      const path = storagePathFromDownloadUrl(afterPhotoUrl);
      if (!path) {
        console.warn("Face reference check: could not parse a Storage path from photoUrl", { companyId, employeeId });
        return;
      }
      const bytes = await downloadImage(path, { companyId, employeeId });
      if (!bytes) return;

      const client = getRekognitionClient();
      let result;
      try {
        result = await client.send(new DetectFacesCommand({ Image: { Bytes: bytes } }));
      } catch (err) {
        console.warn("Face reference check: DetectFaces failed", { companyId, employeeId, error: String(err) });
        return;
      }

      const faceCount = result.FaceDetails?.length ?? 0;

      if (faceCount === 1) {
        if (afterData.faceReference) {
          await employeeRef.update({ faceReference: admin.firestore.FieldValue.delete() });
        }
        await resolveFaceBadReferenceAlert(companyId, employeeId);
        return;
      }

      const reason = faceCount === 0 ? "noFace" : "multipleFaces";
      await employeeRef.update({
        faceReference: {
          status: "bad",
          photoUrl: afterPhotoUrl,
          reason,
          flaggedAt: admin.firestore.Timestamp.now(),
        },
      });
      await createOrKeepFaceBadReferenceAlert(companyId, employeeId, afterData.name ?? "An employee");
    } catch (err) {
      console.warn("Face reference check failed", { companyId, employeeId, error: String(err) });
    }
  }
);
