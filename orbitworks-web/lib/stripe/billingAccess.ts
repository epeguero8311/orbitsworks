import { adminDb } from "@/lib/firebase/admin";
import { hasPermission, resolveAdminAccess } from "@/lib/adminAccess";

// Admin Permissions (Task 4): who may use the billing (Stripe) routes - the
// owner, a Full access admin, or an admin with the Billing permission.
// Legacy admins (no stored access) do NOT get Billing (D8: it was owner-only).
// Reads users/{uid} fresh (the source of truth), never just the token.
export async function canUseBilling(decoded: { uid: string; role?: unknown; companyId?: unknown }): Promise<boolean> {
  const role = typeof decoded.role === "string" ? decoded.role : null;
  const companyId = typeof decoded.companyId === "string" ? decoded.companyId : null;
  if (!companyId) return false;
  if (role === "owner") return true;
  if (role !== "admin") return false;
  const snap = await adminDb.collection("users").doc(decoded.uid).get();
  const data = snap.data() as { role?: string; companyId?: string; adminAccess?: unknown } | undefined;
  if (!data || data.companyId !== companyId || data.role !== "admin") return false;
  return hasPermission(resolveAdminAccess("admin", data.adminAccess), "billing");
}
