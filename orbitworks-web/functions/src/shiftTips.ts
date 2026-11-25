import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "./shared";
import { buildSelfHealData, resolveApprovedByName } from "./timesheetApprovals";
import { setShiftTipSchema } from "./shiftTipValidators";

// Tips (Task 3, decisions D1-D3 in docs/plans/overtime-columns-tips-plan.md).
//
// Saves one shift's tip (whole cents) on its timesheetApprovals/{clockInEventId}
// doc and appends one entry to timesheetApprovals/{id}/tipEdits, both in the
// same transaction. Owner/admin of the company only (custom claims); the
// admin's name is looked up here so it can't be spoofed.
//
// It never touches the approval itself: status / approvedBy* / job /
// overtimeApplied / autoBreak*Applied are left exactly as they are (update
// only - never a full set on an existing doc), so a tip can be edited before
// or after approval without moving frozen OT or the approval state.
//
// Refused while the company's Tips toggle is OFF (the field is hidden then).
// Saving the same amount again is a no-op (no history entry).
//
// Task 4 (D10): add the "Edit pay rates & wages" + site-access check here.
export const setShiftTip = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const parsed = setShiftTipSchema.safeParse(request.data ?? {});
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Enter a tip from $0 to $1,000 with at most 2 decimals.");
  }
  const { eventId, amountCents } = parsed.data;

  const companyRef = db.collection("companies").doc(callerCompanyId);
  const companySnap = await companyRef.get();
  if (companySnap.data()?.tipsEnabled !== true) {
    throw new HttpsError("failed-precondition", "Tips are turned off in Export Settings.");
  }

  const editedByName = await resolveApprovedByName(request.auth.uid);
  const approvalRef = companyRef.collection("timesheetApprovals").doc(eventId);
  // Built before the transaction (it reads the clock-in event); only used
  // when the approval doc turns out to be missing (older shifts).
  const healData = await buildSelfHealData(callerCompanyId, eventId);
  const uid = request.auth.uid;

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(approvalRef);
    if (!snap.exists && !healData) {
      throw new HttpsError("not-found", "Shift not found.");
    }
    const previous = snap.exists ? (snap.data()?.tipCents as unknown) : undefined;
    const previousAmountCents = typeof previous === "number" && Number.isFinite(previous) ? previous : 0;
    // Same amount (a missing tip counts as $0.00): nothing to record.
    if (previousAmountCents === amountCents) {
      return { changed: false };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const tipFields = {
      tipCents: amountCents,
      tipUpdatedByUid: uid,
      tipUpdatedByName: editedByName,
      tipUpdatedAt: now,
    };
    if (snap.exists) {
      tx.update(approvalRef, tipFields);
    } else {
      // Same self-heal as approving: the doc never existed, so a create
      // can't wipe anything.
      tx.create(approvalRef, { ...healData, ...tipFields });
    }
    tx.create(approvalRef.collection("tipEdits").doc(), {
      companyId: callerCompanyId,
      clockInEventId: eventId,
      amountCents,
      previousAmountCents,
      editedByUid: uid,
      editedByName,
      editedAt: now,
    });
    return { changed: true };
  });

  return { success: true, ...result };
});
