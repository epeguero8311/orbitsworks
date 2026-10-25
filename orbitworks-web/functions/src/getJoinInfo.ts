// TODO(Phase 10): RATE LIMIT getJoinInfo along with joinCompany (public,
// unauthenticated).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./shared";
import { CONSENT_VERSIONS } from "./consentVersions";
import { codeProblem, CompanyData, JoinCodeData } from "./joinCompany";
import { getJoinInfoSchema, MIN_SIGNUP_AGE } from "./joinCompanyValidators";

// ---- Employee App: what a crew code shows before sign-up (getJoinInfo) ----
//
// Public, no auth. The app calls this right after a scan to fill the
// sign-up screens. Exactly two outcomes:
//   - { status: "active", ... }  the code can be used right now
//   - { status: "inactive" }     everything else: bad token, not found,
//     revoked, expired, company missing / not Pro, code full, seat caps.
//     The reason is never sent.
// A Firestore / lookup failure is NOT "inactive": it throws a plain
// "internal" error (no reason) so the app offers Retry instead of a dead end.
//
// Never returns counts, caps, company id, site id or anything about other
// employees. Never logs the token.

export interface JoinInfoSubcontractor {
  id: string;
  name: string;
}

export type JoinInfoResult =
  | {
      status: "active";
      companyName: string;
      subcontractors: JoinInfoSubcontractor[];
      privacyPolicyVersion: string;
      biometricConsentVersion: string;
      biometricConsentText: string;
      minSignupAge: number;
    }
  | { status: "inactive" };

// Test-only hook, never passed by the deployed callable: runs before the
// lookups (lets a test simulate a Firestore failure).
export interface JoinInfoHooks {
  beforeLookup?: () => Promise<void>;
}

const INACTIVE: JoinInfoResult = { status: "inactive" };

function log(step: string, err: unknown) {
  const code = (err as { code?: unknown } | undefined)?.code;
  console.error("[getJoinInfo] failed", { step, code: typeof code === "string" || typeof code === "number" ? code : "unknown" });
}

export async function runGetJoinInfo(raw: unknown, hooks: JoinInfoHooks = {}): Promise<JoinInfoResult> {
  const parsed = getJoinInfoSchema.safeParse(raw);
  if (!parsed.success) return INACTIVE;
  const token = parsed.data.token;

  try {
    if (hooks.beforeLookup) await hooks.beforeLookup();

    const codeSnap = await db.collection("joinCodes").doc(token).get();
    if (!codeSnap.exists) return INACTIVE;
    const code = codeSnap.data() as JoinCodeData;
    if (typeof code.companyId !== "string" || !code.companyId) return INACTIVE;

    // Same live checks joinCompany runs (codeProblem), so this never says
    // "active" for a code joinCompany would turn away.
    const companyRef = db.collection("companies").doc(code.companyId);
    const employeesRef = companyRef.collection("employees");
    const [companySnap, active, total] = await Promise.all([
      companyRef.get(),
      employeesRef.where("active", "==", true).count().get(),
      employeesRef.count().get(),
    ]);
    const company = companySnap.exists ? (companySnap.data() as CompanyData) : undefined;
    const problem = codeProblem(code, company, { active: active.data().count, total: total.data().count });
    if (problem) return INACTIVE;

    // Only subcontractors listed on this code that still exist and are active.
    const ids = Array.from(new Set(code.subcontractorIds ?? []));
    const subSnaps = ids.length > 0 ? await db.getAll(...ids.map((id) => companyRef.collection("subcontractors").doc(id))) : [];
    const subcontractors = subSnaps
      .filter((s) => s.exists && s.get("active") !== false)
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
    throw new HttpsError("internal", "Couldn't load this code. Try again.");
  }
}

export const getJoinInfo = onCall(async (request) => {
  try {
    return await runGetJoinInfo(request.data);
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    log("unexpected", err);
    throw new HttpsError("internal", "Couldn't load this code. Try again.");
  }
});
