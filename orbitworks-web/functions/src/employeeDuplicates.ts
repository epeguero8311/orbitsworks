import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./shared";
import { dismissDuplicateFlagSchema } from "./employeeDuplicateValidators";

// ---- Phase 9 (H4 a): dismiss a possible-duplicate flag ----
//
// Sign-up (joinCompany, acceptEmployeeInvite) flags a new employee whose
// name + birthday match an existing one (possibleDuplicateOf). The
// Employees page shows it; an admin/owner who checked and says "not the
// same person" calls this. It removes the flag and keeps, on the same
// employee, which ids were flagged and who dismissed it when (audit).
// The other employee is never touched. The flag never blocked anything,
// and dismissing never changes punches, PINs or access. firestore.rules
// keeps every one of these fields server-only.
export const dismissDuplicateFlag = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  if ((role !== "admin" && role !== "owner") || !companyId) throw new HttpsError("permission-denied", "Not authorized.");
  const parsed = dismissDuplicateFlagSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid employee.");

  const ref = db.collection("companies").doc(companyId).collection("employees").doc(parsed.data.employeeId);
  const user = (await db.collection("users").doc(request.auth.uid).get()).data();
  const byName = typeof user?.name === "string" ? user.name : "";
  const dismissed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Employee not found.");
    const ids = snap.get("possibleDuplicateOf");
    if (!Array.isArray(ids) || ids.length === 0) return false;
    tx.update(ref, {
      possibleDuplicateOf: admin.firestore.FieldValue.delete(),
      duplicateFlaggedAt: admin.firestore.FieldValue.delete(),
      dismissedDuplicateOf: ids,
      duplicateDismissedAt: admin.firestore.FieldValue.serverTimestamp(),
      duplicateDismissedByUid: request.auth?.uid,
      duplicateDismissedByName: byName,
    });
    return true;
  });
  return { ok: true, dismissed };
});
