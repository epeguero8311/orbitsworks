import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { employeeInviteTokenField } from "@/lib/validators/employeeInvite";
import { isCoreOrProPlan } from "@/lib/stripe/tiers";

// What the public /i/{token} page shows (Phase 3B email invites). Read on
// the server with the Admin SDK - employeeInvites can't be read by a
// signed-out browser. Only the company name ever leaves this function.
//
// A light check: the app's getInviteInfo call (functions/src/
// getInviteInfo.ts) runs the full one (seats, the existing row) before
// sign-up, so a "live" page can still end in "no longer active" in the app.

export type PublicInviteState = { state: "live"; companyName: string } | { state: "inactive" };

const INACTIVE: PublicInviteState = { state: "inactive" };

function log(step: string, err: unknown) {
  const code = (err as { code?: unknown } | undefined)?.code;
  console.error("[employeeInvites] failed", { step, code: typeof code === "string" || typeof code === "number" ? code : "unknown" });
}

export async function getPublicInviteState(rawToken: string): Promise<PublicInviteState> {
  const check = employeeInviteTokenField.safeParse(rawToken);
  if (!check.success) return INACTIVE;
  try {
    const snap = await adminDb.collection("employeeInvites").doc(check.data).get();
    if (!snap.exists) return INACTIVE;
    const status = snap.get("status");
    const expiresAt = snap.get("expiresAt") as { toMillis?: () => number } | undefined;
    const companyId = snap.get("companyId");
    if (status !== "pending" || typeof expiresAt?.toMillis !== "function" || expiresAt.toMillis() <= Date.now()) return INACTIVE;
    if (typeof companyId !== "string" || !companyId) return INACTIVE;
    const company = await adminDb.collection("companies").doc(companyId).get();
    if (!company.exists || company.get("subscriptionStatus") === "past_due" || !isCoreOrProPlan(company.get("planTier"))) return INACTIVE;
    return { state: "live", companyName: String(company.get("name") ?? "") || "your company" };
  } catch (err) {
    log("public lookup", err);
    return INACTIVE;
  }
}
