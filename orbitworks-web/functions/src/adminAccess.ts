import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "./shared";
import {
  accessClaimsFor,
  canAccessSite,
  hasPermission,
  resolveAdminAccess,
  type AdminAccess,
  type PermissionKey,
  PERMISSION_LABELS,
} from "./adminAccessModel";

// Admin Permissions (Task 4) - server-side checks shared by every admin
// callable. The users/{uid} doc is the source of truth (always read fresh
// here); custom claims only mirror it for firestore.rules.

export type AdminCaller = {
  uid: string;
  role: "owner" | "admin";
  companyId: string;
  access: AdminAccess;
  name: string;
};

// Signed in + owner/admin of a company (claims), then the fresh access from
// users/{uid}. Same "Not authorized." message the callables used before.
export async function loadAdminCaller(request: Pick<CallableRequest, "auth">): Promise<AdminCaller> {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  if ((role !== "admin" && role !== "owner") || !companyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }
  const snap = await db.collection("users").doc(request.auth.uid).get();
  const data = (snap.data() ?? {}) as { role?: string; companyId?: string; adminAccess?: unknown; name?: string };
  // The doc is authoritative: a claim that's behind a demotion never wins.
  // (A doc without a role - only ever in tests - falls back to the claims.)
  const docHasRole = snap.exists && typeof data.role === "string";
  if (docHasRole && (data.companyId !== companyId || (data.role !== "admin" && data.role !== "owner"))) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }
  const effectiveRole = (docHasRole ? data.role : role) as "owner" | "admin";
  return {
    uid: request.auth.uid,
    role: effectiveRole,
    companyId,
    access: resolveAdminAccess(effectiveRole, data.adminAccess),
    name: data.name || "Admin",
  };
}

export function requirePermission(caller: AdminCaller, key: PermissionKey): void {
  if (!hasPermission(caller.access, key)) {
    throw new HttpsError("permission-denied", `You don't have the "${PERMISSION_LABELS[key]}" permission.`);
  }
}

export const NOT_YOUR_SITE_MESSAGE = "This shift is on a job site you don't have access to.";

export function requireSite(caller: AdminCaller, siteId: string | null | undefined): void {
  if (!canAccessSite(caller.access, siteId)) {
    throw new HttpsError("permission-denied", NOT_YOUR_SITE_MESSAGE);
  }
}

// The shift's site = its clock-in's site (rule 1). Reads the approval doc
// (kept in sync with the clock-in's corrected site), falling back to the
// clock-in event itself.
export async function shiftSiteId(companyId: string, clockInEventId: string): Promise<string | null> {
  const companyRef = db.collection("companies").doc(companyId);
  const approval = await companyRef.collection("timesheetApprovals").doc(clockInEventId).get();
  if (approval.exists) return (approval.data()?.siteId as string | null | undefined) ?? null;
  const event = await companyRef.collection("clockEvents").doc(clockInEventId).get();
  return (event.data()?.siteId as string | null | undefined) ?? null;
}

export async function requireShiftSite(caller: AdminCaller, clockInEventId: string): Promise<void> {
  requireSite(caller, await shiftSiteId(caller.companyId, clockInEventId));
}

// The access of any user in the caller's company (for hierarchy checks).
export async function loadUserAccess(
  companyId: string,
  uid: string
): Promise<{ exists: boolean; role: string | null; access: AdminAccess }> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return { exists: false, role: null, access: resolveAdminAccess(null, null) };
  const data = snap.data() as { role?: string; companyId?: string; adminAccess?: unknown };
  if (data.companyId !== companyId) return { exists: false, role: null, access: resolveAdminAccess(null, null) };
  return { exists: true, role: data.role ?? null, access: resolveAdminAccess(data.role, data.adminAccess) };
}

// Every custom-claims write goes through here, so an admin's access mirror
// is never dropped (missing mirror = legacy all-sites admin in the rules).
// Supervisor / employee claims stay exactly { role, companyId, employeeId }
// (D15). `sup` = the linked employee doc has Supervisor access (G1 sub A).
export async function writeRoleClaims(
  uid: string,
  base: { role: string; companyId: string; employeeId?: string | null }
): Promise<void> {
  const claims: Record<string, unknown> = { role: base.role, companyId: base.companyId };
  if (base.employeeId) claims.employeeId = base.employeeId;
  if (base.role === "admin") {
    const userSnap = await db.collection("users").doc(uid).get();
    const access = resolveAdminAccess("admin", userSnap.data()?.adminAccess);
    Object.assign(claims, accessClaimsFor(access));
    if (base.employeeId) {
      const emp = await db.collection("companies").doc(base.companyId).collection("employees").doc(base.employeeId).get();
      if (emp.data()?.isSupervisor === true) claims.sup = true;
    }
  }
  await admin.auth().setCustomUserClaims(uid, claims);
}
