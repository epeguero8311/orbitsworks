import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "./shared";
import { storagePathFromDownloadUrl } from "./rekognition";

// Biometric Data Policy retention rules (see components/legal/
// BiometricPolicyContent.tsx, which these functions must stay in sync
// with): clock-in/clock-out verification photos are deleted 90 days after
// capture (or, if the event has an unresolved face alert, 90 days after
// that alert is resolved instead); an employee's active reference photo
// is deleted 1 year after deactivation or 3 years after their last clock
// event, whichever is sooner; both are deleted immediately if the
// employee record itself is deleted; and every biometric photo for a
// company is deleted 90 days after that company's subscription is
// canceled. None of this ever touches the clockEvents/employees docs
// themselves or any non-photo field - only the photo in Storage and the
// photoUrl (and, for employees, faceReference) fields that point to it.
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_PHOTO_RETENTION_MS = 90 * DAY_MS;
const DEACTIVATION_RETENTION_MS = 365 * DAY_MS;
const LAST_EVENT_RETENTION_MS = 3 * 365 * DAY_MS;
const CANCELLATION_RETENTION_MS = 90 * DAY_MS;

// Best-effort only, same fail-open shape as rekognition.ts's
// downloadImage - a missing/already-deleted Storage object (404) is a
// silent no-op, not a warning, since every caller below also always
// clears the Firestore field in the same pass regardless of whether this
// succeeds, so a retry on the next sweep just no-ops here again.
async function deletePhotoStorageObject(photoUrl: string, context: Record<string, unknown>): Promise<void> {
  const path = storagePathFromDownloadUrl(photoUrl);
  if (!path) return;
  try {
    await admin.storage().bucket().file(path).delete();
  } catch (err) {
    const code = (err as { code?: number } | undefined)?.code;
    if (code !== 404) {
      console.warn("Failed to delete photo from storage", { ...context, path, error: String(err) });
    }
  }
}

async function deleteClockEventPhoto(companyId: string, eventId: string, photoUrl: string): Promise<void> {
  await deletePhotoStorageObject(photoUrl, { companyId, eventId });
  await db
    .collection("companies")
    .doc(companyId)
    .collection("clockEvents")
    .doc(eventId)
    .update({ photoUrl: admin.firestore.FieldValue.delete() })
    .catch((err) => {
      console.warn("Failed to clear clock event photoUrl", { companyId, eventId, error: String(err) });
    });
}

// Clears the reference photo on an employee doc that otherwise stays -
// the deactivation/last-event sweep and the company-cancellation sweep
// both use this. deleteEmployeeRecord (employees.ts) deletes the whole
// doc instead, so it only needs deletePhotoStorageObject directly, not
// this.
async function deleteEmployeeReferencePhoto(companyId: string, employeeId: string, photoUrl: string): Promise<void> {
  await deletePhotoStorageObject(photoUrl, { companyId, employeeId });
  await db
    .collection("companies")
    .doc(companyId)
    .collection("employees")
    .doc(employeeId)
    .update({
      photoUrl: admin.firestore.FieldValue.delete(),
      faceReference: admin.firestore.FieldValue.delete(),
    })
    .catch((err) => {
      console.warn("Failed to clear employee photoUrl", { companyId, employeeId, error: String(err) });
    });
}

// True if this clock event has a faceMismatch/faceNoFace alert that has
// not yet been actioned. Alerts are never deleted when resolved (they're
// a permanent audit record - see alerts.ts); resolution instead lives as
// a separate companies/{companyId}/alertActions doc whose alertKey points
// back at the alert id (see lib/hooks/useAlertActions.ts). Returns the
// latest resolvedAt across every action found, or null if the alert is
// still open or there was never a face alert on this event at all.
async function faceAlertStatusForEvent(
  companyId: string,
  eventId: string
): Promise<{ blocked: boolean; resolvedAtMs: number | null }> {
  const alertsSnap = await db
    .collection("companies")
    .doc(companyId)
    .collection("alerts")
    .where("eventId", "==", eventId)
    .get();

  let resolvedAtMs: number | null = null;
  for (const alertDoc of alertsSnap.docs) {
    const alertType = (alertDoc.data() as { alertType?: string }).alertType;
    if (alertType !== "faceMismatch" && alertType !== "faceNoFace") continue;

    const actionsSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("alertActions")
      .where("alertKey", "==", alertDoc.id)
      .get();
    if (actionsSnap.empty) {
      return { blocked: true, resolvedAtMs: null };
    }
    for (const actionDoc of actionsSnap.docs) {
      const resolvedAt = (actionDoc.data() as { resolvedAt?: admin.firestore.Timestamp }).resolvedAt;
      const ms = resolvedAt?.toMillis() ?? null;
      if (ms !== null && (resolvedAtMs === null || ms > resolvedAtMs)) resolvedAtMs = ms;
    }
  }
  return { blocked: false, resolvedAtMs };
}

// Clock-in/clock-out verification photos: 90 days after capture, or 90
// days after an unresolved face alert on that event is resolved,
// whichever is later - an unresolved alert blocks deletion outright,
// regardless of how old the event is. Scoped to photoUrl != null (a
// single inequality, no composite index needed) so the working set
// shrinks to only still-undeleted photos as the sweep runs, rather than
// rescanning a company's entire clock-event history every day forever.
export const cleanupClockEventPhotos = onSchedule("every 24 hours", async () => {
  const now = Date.now();
  const companiesSnap = await db.collection("companies").get();

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    const eventsSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("clockEvents")
      .where("photoUrl", "!=", null)
      .get();

    for (const eventDoc of eventsSnap.docs) {
      const data = eventDoc.data() as { photoUrl?: string; timestamp?: admin.firestore.Timestamp };
      if (!data.photoUrl || !data.timestamp) continue;

      let baselineMs = data.timestamp.toMillis();
      try {
        const { blocked, resolvedAtMs } = await faceAlertStatusForEvent(companyId, eventDoc.id);
        if (blocked) continue;
        if (resolvedAtMs !== null && resolvedAtMs > baselineMs) baselineMs = resolvedAtMs;
      } catch (err) {
        console.warn("Face alert lookup failed, skipping photo this sweep", {
          companyId,
          eventId: eventDoc.id,
          error: String(err),
        });
        continue;
      }

      if (now >= baselineMs + CLOCK_PHOTO_RETENTION_MS) {
        await deleteClockEventPhoto(companyId, eventDoc.id, data.photoUrl);
      }
    }
  }
});

// Active reference photos: 1 year after the employee is deactivated, or 3
// years after their last clock event, whichever comes first. Only
// considers currently-deactivated employees (active === false) - an
// active employee's reference photo is never time-expired, no matter how
// old it or their last clock event is. If an employee is reactivated
// before their photo would have been deleted, deactivatedAt is cleared
// (see employees.ts's setEmployeeActive/deactivateEmployeesBulk) and they
// drop out of this query entirely. If reactivated AFTER deletion, they
// simply have no pfp - face checks skip them, same as any employee who
// never had one (see rekognition.ts).
export const cleanupDeactivatedEmployeePhotos = onSchedule("every 24 hours", async () => {
  const now = Date.now();
  const companiesSnap = await db.collection("companies").get();

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    const employeesSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("employees")
      .where("active", "==", false)
      .get();

    for (const employeeDoc of employeesSnap.docs) {
      const data = employeeDoc.data() as {
        photoUrl?: string;
        deactivatedAt?: admin.firestore.Timestamp;
      };
      if (!data.photoUrl) continue;

      const candidates: number[] = [];
      if (data.deactivatedAt) {
        candidates.push(data.deactivatedAt.toMillis() + DEACTIVATION_RETENTION_MS);
      }

      try {
        const lastEventSnap = await db
          .collection("companies")
          .doc(companyId)
          .collection("clockEvents")
          .where("employeeId", "==", employeeDoc.id)
          .orderBy("timestamp", "desc")
          .limit(1)
          .get();
        if (!lastEventSnap.empty) {
          const lastTs = (lastEventSnap.docs[0].data() as { timestamp?: admin.firestore.Timestamp }).timestamp;
          if (lastTs) candidates.push(lastTs.toMillis() + LAST_EVENT_RETENTION_MS);
        }
      } catch (err) {
        console.warn("Last clock event lookup failed, skipping photo this sweep", {
          companyId,
          employeeId: employeeDoc.id,
          error: String(err),
        });
        continue;
      }

      // No deactivatedAt (legacy record) and no clock events ever: there's
      // nothing to compute a deadline from, so never guess one - leave the
      // photo alone rather than invent a date.
      if (candidates.length === 0) continue;

      const deleteAtMs = Math.min(...candidates);
      if (now >= deleteAtMs) {
        await deleteEmployeeReferencePhoto(companyId, employeeDoc.id, data.photoUrl);
      }
    }
  }
});

// Company cancellation: every biometric photo (every employee's reference
// photo, every clock event's verification photo) for a company is deleted
// 90 days after that company's subscription is canceled - no alert
// exception here, unlike cleanupClockEventPhotos above, since the company
// no longer has a Pro plan to review alerts on. clockEvents/employees docs
// themselves, and every other field on them, are left untouched - only
// photoUrl (and, for employees, faceReference) are cleared. planCanceledAt
// is written by autoRevertToFree (app/api/stripe/webhook/route.ts) and
// cleared if the company resubscribes before this runs; biometricPhotosWipedAt
// is the idempotency guard (same shape as alerts.ts's retainedPhotoDeletedAt)
// so a company that's been canceled for a long time doesn't get rescanned
// every day forever once its photos are already gone.
export const cleanupCanceledCompanyPhotos = onSchedule("every 24 hours", async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - CANCELLATION_RETENTION_MS);
  const companiesSnap = await db
    .collection("companies")
    .where("biometricPhotosWipedAt", "==", null)
    .where("planCanceledAt", "<=", cutoff)
    .get();

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;

    const employeesSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("employees")
      .where("photoUrl", "!=", null)
      .get();
    for (const employeeDoc of employeesSnap.docs) {
      const photoUrl = (employeeDoc.data() as { photoUrl?: string }).photoUrl;
      if (photoUrl) await deleteEmployeeReferencePhoto(companyId, employeeDoc.id, photoUrl);
    }

    const eventsSnap = await db
      .collection("companies")
      .doc(companyId)
      .collection("clockEvents")
      .where("photoUrl", "!=", null)
      .get();
    for (const eventDoc of eventsSnap.docs) {
      const photoUrl = (eventDoc.data() as { photoUrl?: string }).photoUrl;
      if (photoUrl) await deleteClockEventPhoto(companyId, eventDoc.id, photoUrl);
    }

    await companyDoc.ref.update({ biometricPhotosWipedAt: admin.firestore.Timestamp.now() }).catch((err) => {
      console.warn("Failed to mark company biometric photos wiped", { companyId, error: String(err) });
    });
  }
});
