// TODO(Phase 10): RATE LIMIT getInviteInfo along with acceptEmployeeInvite,
// joinCompany and getJoinInfo (public, unauthenticated): per-IP / per-token
// limits and App Check before prod.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./shared";
import { CONSENT_VERSIONS } from "./consentVersions";
import { getInviteInfoSchema } from "./employeeInviteValidators";
import { MIN_SIGNUP_AGE } from "./joinCompanyValidators";
import { EmployeeInviteDoc } from "./employeeInviteTypes";
import { inviteProblem, InviteCompany, InviteEmployeeRow } from "./lib/employeeInviteChecks";
import type { JoinInfoResult, JoinInfoSubcontractor } from "./getJoinInfo";

// ---- Employee App: what an email invite link shows before sign-up ----
//
// Public, no auth. Same answer shape as getJoinInfo, so the app's sign-up
// screens are one flow for both (decision: same screens as the QR join):
//   - { status: "active", ... }  the invite can be used right now
//   - { status: "inactive" }     everything else: bad token, not found,
//     expired, revoked, used, company not Core/Pro or past due, no seat,
//     existing row inactive or already linked. The reason is never sent.
// A Firestore failure throws a plain "internal" (the app offers Retry).
//
// Never returns the invited email, counts, caps, ids or anything about
// other employees (decision M1). Never logs the token.
//
// Subcontractors: the company's own active ones (decision N1); the app
// adds "the company itself" as the default.

export interface InviteInfoHooks {
  beforeLookup?: () => Promise<void>;
}

const INACTIVE: JoinInfoResult = { status: "inactive" };

function log(step: string, err: unknown) {
  const code = (err as { code?: unknown } | undefined)?.code;
  console.error("[getInviteInfo] failed", { step, code: typeof code === "string" || typeof code === "number" ? code : "unknown" });
}

export async function runGetInviteInfo(raw: unknown, hooks: InviteInfoHooks = {}): Promise<JoinInfoResult> {
  const parsed = getInviteInfoSchema.safeParse(raw);
  if (!parsed.success) return INACTIVE;

  try {
    if (hooks.beforeLookup) await hooks.beforeLookup();

    const inviteSnap = await db.collection("employeeInvites").doc(parsed.data.token).get();
    if (!inviteSnap.exists) return INACTIVE;
    const invite = inviteSnap.data() as EmployeeInviteDoc;
    if (typeof invite.companyId !== "string" || !invite.companyId) return INACTIVE;

    const companyRef = db.collection("companies").doc(invite.companyId);
    const employeesRef = companyRef.collection("employees");
    const [companySnap, rowSnap, counts] = await Promise.all([
      companyRef.get(),
      invite.kind === "existingEmployee" && invite.employeeId ? employeesRef.doc(invite.employeeId).get() : Promise.resolve(null),
      invite.kind === "newPerson"
        ? Promise.all([employeesRef.where("active", "==", true).count().get(), employeesRef.count().get()]).then(([a, t]) => ({
            active: a.data().count,
            total: t.data().count,
          }))
        : Promise.resolve(undefined),
    ]);
    const company = companySnap.exists ? (companySnap.data() as InviteCompany) : undefined;
    const row = rowSnap && rowSnap.exists ? (rowSnap.data() as InviteEmployeeRow) : undefined;
    if (inviteProblem({ invite, company, row, counts })) return INACTIVE;

    const subsSnap = await companyRef.collection("subcontractors").get();
    const subcontractors: JoinInfoSubcontractor[] = subsSnap.docs
      .filter((s) => s.get("active") !== false)
      .map((s) => ({ id: s.id, name: String(s.get("name") ?? "").trim() }))
      .filter((s) => s.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      status: "active",
      companyName: company?.name ?? "your company",
      subcontractors,
      privacyPolicyVersion: CONSENT_VERSIONS.privacyPolicyVersion,
      biometricConsentVersion: CONSENT_VERSIONS.biometricConsentVersion,
      biometricConsentText: CONSENT_VERSIONS.biometricConsentText,
      minSignupAge: MIN_SIGNUP_AGE,
    };
  } catch (err) {
    log("lookup", err);
    throw new HttpsError("internal", "Couldn't load this invite. Try again.");
  }
}

export const getInviteInfo = onCall(async (request) => {
  try {
    return await runGetInviteInfo(request.data);
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    log("unexpected", err);
    throw new HttpsError("internal", "Couldn't load this invite. Try again.");
  }
});
