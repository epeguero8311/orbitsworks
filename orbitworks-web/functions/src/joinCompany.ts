// TODO(Phase 10): RATE LIMIT joinCompany. It is unauthenticated and creates
// Firebase Auth users - add per-IP / per-token limits (and App Check) before
// this ships to prod.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { db } from "./shared";
import { reserveNonJunkPin } from "./createEmployee";
import { linkEmployeeLogin } from "./employeeAccess";
import { BIOMETRIC_CONSENT_VERSION, PRIVACY_POLICY_VERSION } from "./consentVersions";
import { decodeSelfie, joinCompanySchema, JoinCompanyInput, normalizeName } from "./joinCompanyValidators";

// ---- Employee App: QR sign-up (joinCompany) ----
//
// The one server entry point for "scan a crew code, sign up". Order:
//   1. zod-validate the input (token only ever in this request body)
//   2. quick code check, so a dead code fails before anything is created
//   3. create the Auth user ("email already in use" gets its own message)
//   4. reserve a unique PIN (existing reserveNonJunkPin)
//   5. ONE transaction: re-check code/plan/seats/total cap/subcontractor,
//      create the employee doc, finalize the PIN, bump joinedCount, and
//      write the consent record - so consent exists before any face data
//   6. linkEmployeeLogin: users doc + employee custom claims
//   7. save the selfie, server-copy it to reference.jpg, THEN set photoUrl.
//      Face processing (onEmployeePhotoWrite / checkFaceMatch in
//      rekognition.ts) starts only from the employee doc's photoUrl - there
//      is no Storage trigger - so it can't run before step 5's consent.
// Any failure after step 3 rolls everything back (rollback() below).
//
// Never log the token, password, PIN, email, name, birthday or photo - log()
// only prints a step name and an error code.

export const JOIN_ERRORS = {
  inactive: "This code is no longer active. Ask your admin for a new QR code.",
  accountProblem: "There's a problem with this company's account. Please speak to your admin.",
  emailInUse: "An account with this email already exists. Sign in instead, or use a different email.",
  subcontractor: "That company option isn't available on this code anymore. Go back and pick another.",
  consentVersion: "The privacy policy or consent was updated. Go back, review it and accept again.",
  photo: "That photo couldn't be used. Retake your selfie.",
  generic: "Something went wrong. Try again.",
} as const;

export type JoinErrorReason = keyof typeof JOIN_ERRORS | "invalid";

const ERROR_CODES: Record<JoinErrorReason, "failed-precondition" | "already-exists" | "invalid-argument" | "internal"> = {
  inactive: "failed-precondition",
  accountProblem: "failed-precondition",
  emailInUse: "already-exists",
  subcontractor: "invalid-argument",
  consentVersion: "invalid-argument",
  photo: "invalid-argument",
  invalid: "invalid-argument",
  generic: "internal",
};

function joinError(reason: JoinErrorReason, message?: string): HttpsError {
  return new HttpsError(ERROR_CODES[reason], message ?? JOIN_ERRORS[reason as keyof typeof JOIN_ERRORS], { reason });
}

// Test-only hooks. The deployed callable never passes any - see the
// joinCompany export at the bottom. failAt forces a failure right after the
// named step (rollback tests); inTransaction runs after the transaction's
// reads and before its writes (seat race test).
export type JoinStep = "authUser" | "pin" | "transaction" | "link" | "selfie" | "reference" | "photoUrl";
export interface JoinHooks {
  failAt?: JoinStep;
  inTransaction?: () => Promise<void>;
}

export interface JoinCompanyResult {
  employeeId: string;
  pin: string;
  companyName: string;
}

// ---- code / plan / seat state (keep in sync with lib/joinCodes/server.ts) ----

export interface JoinCodeData {
  codeId: string;
  companyId: string;
  siteId: string;
  subcontractorIds?: string[];
  userLimit: number | null;
  joinedCount?: number;
  status: string;
  replacedByToken?: string | null;
  expiresAt: admin.firestore.Timestamp | null;
}

export interface CompanyData {
  name?: string;
  planTier?: string | null;
  employeeCap?: number | null;
  totalEmployeeCap?: number | null;
}

// Duplicated from lib/stripe/tiers.ts's isProPlan, same as rekognition.ts.
// past_due keeps its pro_ planTier, so it counts as Pro here.
function isProPlan(planTier: string | undefined | null): boolean {
  return !!planTier && planTier.startsWith("pro_");
}

// Same split as getPublicJoinState in lib/joinCodes/server.ts: revoked /
// expired / unknown -> "no longer active"; full / no seats / not Pro / total
// cap -> "problem with this company's account".
export function codeProblem(
  code: JoinCodeData | undefined,
  company: CompanyData | undefined,
  counts: { active: number; total: number },
  nowMs: number = Date.now()
): "inactive" | "accountProblem" | null {
  if (!code) return "inactive";
  if (code.status === "revoked" || code.replacedByToken) return "inactive";
  if (code.expiresAt && code.expiresAt.toMillis() <= nowMs) return "inactive";
  if (!company || !isProPlan(company.planTier)) return "accountProblem";
  if (code.userLimit !== null && (code.joinedCount ?? 0) >= code.userLimit) return "accountProblem";
  const cap = company.employeeCap ?? null;
  if (cap !== null && cap - counts.active <= 0) return "accountProblem";
  const totalCap = company.totalEmployeeCap ?? null;
  if (totalCap !== null && totalCap - counts.total <= 0) return "accountProblem";
  return null;
}

// subcontractorIds [] = in-house only. A listed subcontractor must still
// exist and be active. null (the company itself) is always allowed.
function subcontractorProblem(
  code: JoinCodeData,
  subcontractorId: string | null,
  sub: FirebaseFirestore.DocumentSnapshot | null
): boolean {
  if (subcontractorId === null) return false;
  if (!(code.subcontractorIds ?? []).includes(subcontractorId)) return true;
  return !sub || !sub.exists || sub.get("active") === false;
}

// ---- logging (no PII) ----

function log(step: string, err: unknown) {
  const code = (err as { code?: unknown } | undefined)?.code;
  console.error("[joinCompany] failed", { step, code: typeof code === "string" || typeof code === "number" ? code : "unknown" });
}

// ---- main ----

function parseInput(raw: unknown): JoinCompanyInput {
  const result = joinCompanySchema.safeParse(raw);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  if (!first || first.path[0] === "token") throw joinError("inactive");
  if (first.path[0] === "selfieBase64") throw joinError("photo");
  throw joinError("invalid", first.message);
}

interface Rollback {
  uid: string | null;
  companyId: string;
  employeeId: string;
  pin: string | null;
  token: string;
  committed: boolean;
  faceFileWritten: boolean;
}

const paths = (companyId: string, employeeId: string) => ({
  selfie: `companies/${companyId}/employees/${employeeId}/selfie/signup.jpg`,
  reference: `companies/${companyId}/employees/${employeeId}/reference.jpg`,
});

async function deleteFile(path: string) {
  try {
    await admin.storage().bucket().file(path).delete();
  } catch (err) {
    if ((err as { code?: number }).code !== 404) throw err;
  }
}

// Undo everything a failed sign-up wrote. Each step is separate so one
// failure can't stop the rest. joinedCount is only given back if the
// transaction committed (it's the only place it was bumped).
async function rollback(r: Rollback) {
  const companyRef = db.collection("companies").doc(r.companyId);
  const steps: [string, () => Promise<unknown>][] = [
    ["rollback:files", async () => {
      const p = paths(r.companyId, r.employeeId);
      await deleteFile(p.reference);
      await deleteFile(p.selfie);
    }],
    ["rollback:pin", async () => {
      if (!r.pin) return;
      const pinRef = companyRef.collection("pins").doc(r.pin);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(pinRef);
        const holder = snap.exists ? (snap.get("employeeId") as string | null) : undefined;
        if (snap.exists && (holder === null || holder === r.employeeId)) tx.delete(pinRef);
      });
    }],
    ["rollback:employee", async () => {
      if (!r.committed) return;
      await companyRef.collection("employees").doc(r.employeeId).delete();
    }],
    ["rollback:consent", async () => {
      if (!r.committed) return;
      const consentRef = companyRef.collection("employeeConsents").doc(r.employeeId);
      // If face data was ever written, keep the record as proof it was
      // destroyed. Otherwise the person never joined - remove it.
      if (r.faceFileWritten) {
        await consentRef.update({
          faceDataDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
          faceDataDeletedReason: "signupRolledBack",
          signupRolledBack: true,
        });
      } else {
        await consentRef.delete();
      }
    }],
    ["rollback:joinedCount", async () => {
      if (!r.committed) return;
      await db.collection("joinCodes").doc(r.token).update({ joinedCount: admin.firestore.FieldValue.increment(-1) });
    }],
    ["rollback:userDoc", async () => {
      if (r.uid) await db.collection("users").doc(r.uid).delete();
    }],
    ["rollback:authUser", async () => {
      if (r.uid) await admin.auth().deleteUser(r.uid);
    }],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      log(name, err);
    }
  }
}

export async function runJoinCompany(raw: unknown, hooks: JoinHooks = {}): Promise<JoinCompanyResult> {
  const checkpoint = (step: JoinStep) => {
    if (hooks.failAt === step) throw new Error(`forced test failure after ${step}`);
  };

  // 1. Validate
  const input = parseInput(raw);
  if (input.privacyVersion !== PRIVACY_POLICY_VERSION || input.biometricConsentVersion !== BIOMETRIC_CONSENT_VERSION) {
    throw joinError("consentVersion");
  }
  const selfie = decodeSelfie(input.selfieBase64);
  if (!selfie) throw joinError("photo");

  // 2. Quick check before creating anything (re-checked in the transaction)
  const codeRef = db.collection("joinCodes").doc(input.token);
  const codeSnap = await codeRef.get();
  const precheckCode = codeSnap.exists ? (codeSnap.data() as JoinCodeData) : undefined;
  if (!precheckCode) throw joinError("inactive");
  const companyId = precheckCode.companyId;
  const companyRef = db.collection("companies").doc(companyId);
  const employeesRef = companyRef.collection("employees");
  {
    const [companySnap, active, total] = await Promise.all([
      companyRef.get(),
      employeesRef.where("active", "==", true).count().get(),
      employeesRef.count().get(),
    ]);
    const problem = codeProblem(precheckCode, companySnap.data() as CompanyData | undefined, {
      active: active.data().count,
      total: total.data().count,
    });
    if (problem) throw joinError(problem);
    const sub = input.subcontractorId ? await companyRef.collection("subcontractors").doc(input.subcontractorId).get() : null;
    if (subcontractorProblem(precheckCode, input.subcontractorId, sub)) throw joinError("subcontractor");
  }

  // 3. Auth user
  let uid: string;
  try {
    const user = await admin.auth().createUser({ email: input.email, password: input.password, displayName: input.fullName });
    uid = user.uid;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") throw joinError("emailInUse");
    if (code === "auth/invalid-email") throw joinError("invalid", "Enter a valid email.");
    if (code === "auth/invalid-password") throw joinError("invalid", "Password must be at least 8 characters.");
    log("authUser", err);
    throw joinError("generic");
  }

  const employeeRef = employeesRef.doc();
  const employeeId = employeeRef.id;
  const r: Rollback = { uid, companyId, employeeId, pin: null, token: input.token, committed: false, faceFileWritten: false };
  let step: string = "authUser";

  try {
    checkpoint("authUser");

    // 4. PIN (claimed with employeeId: null until the transaction)
    step = "pin";
    const pin = await reserveNonJunkPin(companyId, null);
    r.pin = pin;
    checkpoint("pin");

    // 5. Transaction. Reads AND writes the company doc (lastJoinAt), so
    // two sign-ups racing for the last seat can't both commit - the loser
    // retries, re-reads the live counts below, and is turned away.
    // activeEmployeeCount (onEmployeeWrite) lags a moment, so seats come
    // from live count queries, not that counter.
    step = "transaction";
    let companyName = "your company";
    const consentRef = companyRef.collection("employeeConsents").doc(employeeId);
    await db.runTransaction(async (tx) => {
      const subRef = input.subcontractorId ? companyRef.collection("subcontractors").doc(input.subcontractorId) : null;
      const [code, company, active, total, sub, sameBirthday] = await Promise.all([
        tx.get(codeRef),
        tx.get(companyRef),
        tx.get(employeesRef.where("active", "==", true).count()),
        tx.get(employeesRef.count()),
        subRef ? tx.get(subRef) : Promise.resolve(null),
        tx.get(employeesRef.where("dob", "==", input.birthday)),
      ]);
      const codeData = code.exists ? (code.data() as JoinCodeData) : undefined;
      const companyData = company.exists ? (company.data() as CompanyData) : undefined;
      if (codeData?.companyId !== companyId) throw joinError("inactive");
      const problem = codeProblem(codeData, companyData, { active: active.data().count, total: total.data().count });
      if (problem) throw joinError(problem);
      if (subcontractorProblem(codeData, input.subcontractorId, sub)) throw joinError("subcontractor");
      if (hooks.inTransaction) await hooks.inTransaction();

      companyName = companyData?.name ?? companyName;
      const nameKey = normalizeName(input.fullName);
      const duplicates = sameBirthday.docs.filter((d) => normalizeName(String(d.get("name") ?? "")) === nameKey).map((d) => d.id);
      const now = admin.firestore.FieldValue.serverTimestamp();

      tx.create(employeeRef, {
        name: input.fullName,
        dob: input.birthday,
        active: true,
        faceStatus: "not_enrolled",
        assignedSiteIds: [codeData.siteId],
        pin,
        subcontractorId: input.subcontractorId,
        subcontractorName: sub && sub.exists ? String(sub.get("name") ?? "") : null,
        joinedVia: "qr",
        joinCodeId: codeData.codeId,
        createdByUid: uid,
        createdAt: now,
        ...(duplicates.length > 0 ? { possibleDuplicateOf: duplicates, duplicateFlaggedAt: now } : {}),
      });
      tx.set(companyRef.collection("pins").doc(pin), { employeeId, updatedAt: admin.firestore.Timestamp.now() });
      tx.update(codeRef, { joinedCount: admin.firestore.FieldValue.increment(1), lastJoinedAt: now });
      tx.update(companyRef, { lastJoinAt: now });
      tx.create(consentRef, {
        uid,
        employeeId,
        companyId,
        joinCodeId: codeData.codeId,
        privacyPolicyVersion: input.privacyVersion,
        privacyAcceptedAt: now,
        biometricConsentVersion: input.biometricConsentVersion,
        biometricConsentAt: now,
        source: "qrSignup",
        faceDataDeletedAt: null,
      });
    });
    r.committed = true;
    checkpoint("transaction");

    // 6. Login: users doc + custom claims
    step = "link";
    await linkEmployeeLogin({ uid, companyId, employeeId, email: input.email, joinedVia: "qr", joinCodeId: (codeSnap.data() as JoinCodeData).codeId });
    checkpoint("link");

    // 7. Photos - only once the consent record is confirmed to exist.
    step = "selfie";
    const consent = await consentRef.get();
    if (!consent.exists || !consent.get("biometricConsentAt")) throw new Error("consent record missing");
    const bucket = admin.storage().bucket();
    const p = paths(companyId, employeeId);
    r.faceFileWritten = true;
    await bucket.file(p.selfie).save(selfie, { contentType: "image/jpeg", resumable: false });
    checkpoint("selfie");

    step = "reference";
    const downloadToken = randomUUID();
    await bucket.file(p.selfie).copy(bucket.file(p.reference));
    await bucket.file(p.reference).setMetadata({ contentType: "image/jpeg", metadata: { firebaseStorageDownloadTokens: downloadToken } });
    checkpoint("reference");

    step = "photoUrl";
    const photoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(p.reference)}?alt=media&token=${downloadToken}`;
    await employeeRef.update({ photoUrl });
    checkpoint("photoUrl");

    return { employeeId, pin, companyName };
  } catch (err) {
    const isJoinError = err instanceof HttpsError && !!(err.details as { reason?: string } | undefined)?.reason;
    if (!isJoinError) log(step, err);
    await rollback(r);
    if (isJoinError) throw err;
    throw joinError("generic");
  }
}

export const joinCompany = onCall({ memory: "512MiB" }, async (request) => {
  try {
    return await runJoinCompany(request.data);
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    log("unexpected", err);
    throw joinError("generic");
  }
});
