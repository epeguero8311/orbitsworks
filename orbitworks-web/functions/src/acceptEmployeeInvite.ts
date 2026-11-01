// TODO(Phase 10): RATE LIMIT acceptEmployeeInvite along with getInviteInfo,
// joinCompany and getJoinInfo. It is unauthenticated and creates Firebase
// Auth users - add per-IP / per-token limits (and App Check) before prod.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "./shared";
import { reserveNonJunkPin } from "./createEmployee";
import { linkEmployeeLogin } from "./employeeAccess";
import { BIOMETRIC_CONSENT_VERSION, PRIVACY_POLICY_VERSION } from "./consentVersions";
import { decodeSelfie, normalizeName } from "./joinCompanyValidators";
import { JOIN_ERRORS } from "./joinCompany";
import { acceptEmployeeInviteSchema, AcceptEmployeeInviteInput, INVITE_ERRORS } from "./employeeInviteValidators";
import { EmployeeInviteDoc } from "./employeeInviteTypes";
import { inviteProblem, InviteCompany, InviteEmployeeRow } from "./lib/employeeInviteChecks";
import { copySelfieToPhoto, deleteStorageFile, isProPlan, releaseSignupPin, saveSelfieFile } from "./lib/signupShared";
import { storagePathFromDownloadUrl } from "./rekognition";

// ---- Employee App: email invite sign-up (acceptEmployeeInvite) ----
//
// The invite version of joinCompany. Same screens, same input rules, same
// order and rollback; the token is an employeeInvites/{token} doc instead
// of a crew code. Works for Core and Pro (face processing only runs on Pro,
// in rekognition.ts, from the photoUrl write - nothing here checks faces).
//   1. zod-validate the input
//   2. quick check: invite usable (lib/employeeInviteChecks.ts), email ==
//      the invited email, subcontractor ok - all BEFORE any login exists,
//      so a wrong-email try creates nothing
//   3. create the Auth user
//   4. new person only: reserve a PIN. Existing row keeps its PIN.
//   5. ONE transaction: re-check all of step 2 (+ live seats for a new
//      person), mark the invite accepted (one-time use), create the row
//      (new person) or update dob/subcontractor (existing row), finalize
//      the PIN, write the consent record
//   6. linkEmployeeLogin: users doc + claims, joinedVia "invite"
//   7. save the selfie, copy it to the profile photo, THEN set photoUrl
// Any failure after step 3 rolls everything back, including putting the
// invite back to pending and restoring an existing row's old fields.
//
// Existing row (decision I1): its name, PIN, sites, rate and history stay.
// Birthday is saved, the subcontractor becomes what they picked (logged in
// subcontractorHistory when it changes), the selfie becomes the photo (and
// so the face reference on Pro). Pro: the old photo file is deleted once
// the sign-up fully succeeds (step 8). Core: the old file is kept.
//
// Never log the token, password, PIN, email, name, birthday or photo.

type Reason = keyof typeof JOIN_ERRORS | keyof typeof INVITE_ERRORS | "invalid";

const MESSAGES: Record<Exclude<Reason, "invalid">, string> = { ...JOIN_ERRORS, ...INVITE_ERRORS };

const CODES: Record<Reason, "failed-precondition" | "already-exists" | "invalid-argument" | "internal"> = {
  inactive: "failed-precondition",
  accountProblem: "failed-precondition",
  inviteInactive: "failed-precondition",
  inviteUnusable: "failed-precondition",
  emailMismatch: "invalid-argument",
  emailInUse: "already-exists",
  subcontractor: "invalid-argument",
  consentVersion: "invalid-argument",
  photo: "invalid-argument",
  invalid: "invalid-argument",
  generic: "internal",
};

function inviteError(reason: Reason, message?: string): HttpsError {
  return new HttpsError(CODES[reason], message ?? MESSAGES[reason as Exclude<Reason, "invalid">], { reason });
}

export type AcceptStep = "authUser" | "pin" | "transaction" | "link" | "selfie" | "reference" | "photoUrl";
export interface AcceptHooks {
  failAt?: AcceptStep;
  inTransaction?: () => Promise<void>;
}

export interface AcceptEmployeeInviteResult {
  employeeId: string;
  pin: string;
  companyName: string;
}

function log(step: string, err: unknown) {
  const code = (err as { code?: unknown } | undefined)?.code;
  console.error("[acceptEmployeeInvite] failed", { step, code: typeof code === "string" || typeof code === "number" ? code : "unknown" });
}

function parseInput(raw: unknown): AcceptEmployeeInviteInput {
  const result = acceptEmployeeInviteSchema.safeParse(raw);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  if (!first || first.path[0] === "token") throw inviteError("inviteInactive");
  if (first.path[0] === "selfieBase64") throw inviteError("photo");
  throw inviteError("invalid", first.message);
}

const subProblem = (subcontractorId: string | null, sub: FirebaseFirestore.DocumentSnapshot | null) =>
  subcontractorId !== null && (!sub || !sub.exists || sub.get("active") === false);

const paths = (companyId: string, employeeId: string, inviteId: string, existingRow: boolean) => ({
  selfie: `companies/${companyId}/employees/${employeeId}/selfie/invite-${inviteId}.jpg`,
  // A new row gets the standard reference.jpg (like QR). An existing row
  // may already have a photo there, so its new photo goes beside the
  // selfie instead of overwriting it (deleteEmployee clears selfie/ too).
  photo: existingRow
    ? `companies/${companyId}/employees/${employeeId}/selfie/invite-${inviteId}-photo.jpg`
    : `companies/${companyId}/employees/${employeeId}/reference.jpg`,
});

// Existing-row fields this sign-up may change, saved so rollback can put
// them back exactly (undefined = the field wasn't there).
const RESTORE_FIELDS = [
  "dob",
  "subcontractorId",
  "subcontractorName",
  "subcontractorHistory",
  "photoUrl",
  "linkedUserId",
  "email",
  "appAccess",
  "joinedVia",
  "joinCodeId",
  "employeeInviteId",
] as const;

interface Rollback {
  uid: string | null;
  token: string;
  companyId: string;
  employeeId: string;
  inviteId: string;
  existingRow: boolean;
  before: Record<string, unknown> | null;
  pin: string | null;
  committed: boolean;
  faceFileWritten: boolean;
}

async function rollback(r: Rollback) {
  const companyRef = db.collection("companies").doc(r.companyId);
  const employeeRef = companyRef.collection("employees").doc(r.employeeId);
  const steps: [string, () => Promise<unknown>][] = [
    ["rollback:files", async () => {
      const p = paths(r.companyId, r.employeeId, r.inviteId, r.existingRow);
      await deleteStorageFile(p.photo);
      await deleteStorageFile(p.selfie);
    }],
    ["rollback:pin", async () => {
      if (r.pin) await releaseSignupPin(r.companyId, r.pin, r.employeeId);
    }],
    ["rollback:employee", async () => {
      if (!r.committed) return;
      if (!r.existingRow) {
        await employeeRef.delete();
        return;
      }
      const restore: Record<string, unknown> = {};
      for (const key of RESTORE_FIELDS) {
        const value = r.before ? r.before[key] : undefined;
        restore[key] = value === undefined ? admin.firestore.FieldValue.delete() : value;
      }
      await employeeRef.update(restore);
    }],
    ["rollback:consent", async () => {
      if (!r.committed) return;
      const consentRef = companyRef.collection("employeeConsents").doc(r.employeeId);
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
    ["rollback:invite", async () => {
      if (!r.committed) return;
      // Back to pending so the person can simply try again.
      await db.collection("employeeInvites").doc(r.token).update({
        status: "pending",
        acceptedAt: null,
        acceptedByUid: null,
        employeeId: r.existingRow ? r.employeeId : null,
      });
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

export async function runAcceptEmployeeInvite(raw: unknown, hooks: AcceptHooks = {}): Promise<AcceptEmployeeInviteResult> {
  const checkpoint = (step: AcceptStep) => {
    if (hooks.failAt === step) throw new Error(`forced test failure after ${step}`);
  };

  // 1. Validate
  const input = parseInput(raw);
  if (input.privacyVersion !== PRIVACY_POLICY_VERSION || input.biometricConsentVersion !== BIOMETRIC_CONSENT_VERSION) {
    throw inviteError("consentVersion");
  }
  const selfie = decodeSelfie(input.selfieBase64);
  if (!selfie) throw inviteError("photo");

  // 2. Quick check before creating anything (all re-checked in step 5)
  const inviteRef = db.collection("employeeInvites").doc(input.token);
  const inviteSnap = await inviteRef.get();
  const precheck = inviteSnap.exists ? (inviteSnap.data() as EmployeeInviteDoc) : undefined;
  if (!precheck || typeof precheck.companyId !== "string" || !precheck.companyId) throw inviteError("inviteInactive");
  const companyId = precheck.companyId;
  const inviteId = precheck.inviteId;
  const existingRow = precheck.kind === "existingEmployee";
  if (existingRow && !precheck.employeeId) throw inviteError("inviteUnusable");
  const companyRef = db.collection("companies").doc(companyId);
  const employeesRef = companyRef.collection("employees");
  {
    const [companySnap, rowSnap, counts, sub] = await Promise.all([
      companyRef.get(),
      existingRow ? employeesRef.doc(precheck.employeeId as string).get() : Promise.resolve(null),
      existingRow
        ? Promise.resolve(undefined)
        : Promise.all([employeesRef.where("active", "==", true).count().get(), employeesRef.count().get()]).then(([a, t]) => ({
            active: a.data().count,
            total: t.data().count,
          })),
      input.subcontractorId ? companyRef.collection("subcontractors").doc(input.subcontractorId).get() : Promise.resolve(null),
    ]);
    const company = companySnap.exists ? (companySnap.data() as InviteCompany) : undefined;
    const row = rowSnap && rowSnap.exists ? (rowSnap.data() as InviteEmployeeRow) : undefined;
    // A dead link says only "no longer active", even to the right person.
    const problem = inviteProblem({ invite: precheck, company, row, counts });
    if (problem === "inviteInactive") throw inviteError(problem);
    if (input.email !== precheck.email) throw inviteError("emailMismatch");
    if (problem) throw inviteError(problem);
    if (subProblem(input.subcontractorId, sub)) throw inviteError("subcontractor");
  }

  // 3. Auth user
  let uid: string;
  try {
    const user = await admin.auth().createUser({ email: input.email, password: input.password, displayName: input.fullName });
    uid = user.uid;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") throw inviteError("emailInUse");
    if (code === "auth/invalid-email") throw inviteError("invalid", "Enter a valid email.");
    if (code === "auth/invalid-password") throw inviteError("invalid", "Password must be at least 8 characters.");
    log("authUser", err);
    throw inviteError("generic");
  }

  const employeeRef = existingRow ? employeesRef.doc(precheck.employeeId as string) : employeesRef.doc();
  const employeeId = employeeRef.id;
  const r: Rollback = {
    uid,
    token: input.token,
    companyId,
    employeeId,
    inviteId,
    existingRow,
    before: null,
    pin: null,
    committed: false,
    faceFileWritten: false,
  };
  let step: string = "authUser";

  try {
    checkpoint("authUser");

    // 4. PIN - new person only
    step = "pin";
    let pin: string | null = null;
    if (!existingRow) {
      pin = await reserveNonJunkPin(companyId, null);
      r.pin = pin;
    }
    checkpoint("pin");

    // 5. Transaction. Writes the company doc (lastJoinAt) so two sign-ups
    // racing for the last seat can't both commit, and writes the invite so
    // the same invite can never be accepted twice.
    step = "transaction";
    let companyName = "your company";
    let companyIsPro = false;
    const consentRef = companyRef.collection("employeeConsents").doc(employeeId);
    await db.runTransaction(async (tx) => {
      const subRef = input.subcontractorId ? companyRef.collection("subcontractors").doc(input.subcontractorId) : null;
      const siteRef = !existingRow && precheck.siteId ? companyRef.collection("jobSites").doc(precheck.siteId) : null;
      const [inviteNow, company, row, active, total, sub, site, sameBirthday] = await Promise.all([
        tx.get(inviteRef),
        tx.get(companyRef),
        existingRow ? tx.get(employeeRef) : Promise.resolve(null),
        existingRow ? Promise.resolve(null) : tx.get(employeesRef.where("active", "==", true).count()),
        existingRow ? Promise.resolve(null) : tx.get(employeesRef.count()),
        subRef ? tx.get(subRef) : Promise.resolve(null),
        siteRef ? tx.get(siteRef) : Promise.resolve(null),
        existingRow ? Promise.resolve(null) : tx.get(employeesRef.where("dob", "==", input.birthday)),
      ]);
      const invite = inviteNow.exists ? (inviteNow.data() as EmployeeInviteDoc) : undefined;
      const companyData = company.exists ? (company.data() as InviteCompany) : undefined;
      const rowData = row && row.exists ? (row.data() as InviteEmployeeRow & Record<string, unknown>) : undefined;
      if (!invite || invite.companyId !== companyId || invite.inviteId !== inviteId) throw inviteError("inviteInactive");
      const counts = active && total ? { active: active.data().count, total: total.data().count } : undefined;
      const problem = inviteProblem({ invite, company: companyData, row: rowData, counts });
      if (problem === "inviteInactive") throw inviteError(problem);
      if (input.email !== invite.email) throw inviteError("emailMismatch");
      if (problem) throw inviteError(problem);
      if (subProblem(input.subcontractorId, sub)) throw inviteError("subcontractor");
      if (hooks.inTransaction) await hooks.inTransaction();

      companyName = companyData?.name ?? companyName;
      companyIsPro = isProPlan(companyData?.planTier);
      const now = admin.firestore.FieldValue.serverTimestamp();
      const subName = sub && sub.exists ? String(sub.get("name") ?? "") : null;

      tx.update(inviteRef, { status: "accepted", acceptedAt: now, acceptedByUid: uid, employeeId });

      if (existingRow && rowData) {
        pin = typeof rowData.pin === "string" ? rowData.pin : "";
        r.before = Object.fromEntries(RESTORE_FIELDS.map((k) => [k, rowData[k]]));
        const update: Record<string, unknown> = { dob: input.birthday };
        const prevSubId = (rowData.subcontractorId as string | null | undefined) ?? null;
        if (prevSubId !== input.subcontractorId) {
          update.subcontractorId = input.subcontractorId;
          update.subcontractorName = subName;
          update.subcontractorHistory = admin.firestore.FieldValue.arrayUnion({
            previousSubcontractorId: prevSubId,
            previousSubcontractorName: (rowData.subcontractorName as string | null | undefined) ?? null,
            newSubcontractorId: input.subcontractorId,
            newSubcontractorName: subName,
            changedByUid: uid,
            changedByName: String(rowData.name ?? ""),
            changedAt: admin.firestore.Timestamp.now(),
            reason: "Picked at app sign-up (email invite)",
          });
        }
        tx.update(employeeRef, update);
      } else {
        const siteOk = !!site && site.exists && site.get("active") !== false;
        const nameKey = normalizeName(input.fullName);
        const duplicates = (sameBirthday?.docs ?? []).filter((d) => normalizeName(String(d.get("name") ?? "")) === nameKey).map((d) => d.id);
        tx.create(employeeRef, {
          name: input.fullName,
          dob: input.birthday,
          active: true,
          faceStatus: "not_enrolled",
          // The invite's site if it is still active, else none (an admin
          // assigns one later).
          assignedSiteIds: siteOk && precheck.siteId ? [precheck.siteId] : [],
          pin,
          subcontractorId: input.subcontractorId,
          subcontractorName: subName,
          joinedVia: "invite",
          employeeInviteId: inviteId,
          createdByUid: uid,
          createdAt: now,
          ...(duplicates.length > 0 ? { possibleDuplicateOf: duplicates, duplicateFlaggedAt: now } : {}),
        });
        tx.set(companyRef.collection("pins").doc(pin as string), { employeeId, updatedAt: admin.firestore.Timestamp.now() });
      }
      tx.update(companyRef, { lastJoinAt: now });
      tx.set(consentRef, {
        uid,
        employeeId,
        companyId,
        joinCodeId: null,
        employeeInviteId: inviteId,
        privacyPolicyVersion: input.privacyVersion,
        privacyAcceptedAt: now,
        biometricConsentVersion: input.biometricConsentVersion,
        biometricConsentAt: now,
        source: "emailInvite",
        faceDataDeletedAt: null,
      });
    });
    r.committed = true;
    checkpoint("transaction");

    // 6. Login: users doc + custom claims
    step = "link";
    await linkEmployeeLogin({ uid, companyId, employeeId, email: input.email, joinedVia: "invite", employeeInviteId: inviteId });
    checkpoint("link");

    // 7. Photos - only once the consent record is confirmed to exist.
    step = "selfie";
    const consent = await consentRef.get();
    if (!consent.exists || !consent.get("biometricConsentAt")) throw new Error("consent record missing");
    const p = paths(companyId, employeeId, inviteId, existingRow);
    r.faceFileWritten = true;
    await saveSelfieFile(p.selfie, selfie);
    checkpoint("selfie");

    step = "reference";
    const photoUrl = await copySelfieToPhoto(p.selfie, p.photo);
    checkpoint("reference");

    step = "photoUrl";
    await employeeRef.update({ photoUrl });
    checkpoint("photoUrl");

    // 8. Pro, existing row: the sign-up fully succeeded and the selfie is
    // now the face reference (rekognition.ts reads employee.photoUrl), so
    // delete the OLD face reference file - no old biometric photos kept.
    // Only a file inside this employee's own folder. Best-effort: the
    // sign-up already succeeded, so a failure here is logged, not undone.
    // Core keeps the old profile photo (no face check there).
    const oldPhotoUrl = r.before ? r.before.photoUrl : undefined;
    if (existingRow && companyIsPro && typeof oldPhotoUrl === "string" && oldPhotoUrl !== photoUrl) {
      const oldPath = storagePathFromDownloadUrl(oldPhotoUrl);
      if (oldPath && oldPath !== p.photo && oldPath.startsWith(`companies/${companyId}/employees/${employeeId}/`)) {
        try {
          await deleteStorageFile(oldPath);
        } catch (err) {
          log("oldPhoto", err);
        }
      }
    }

    return { employeeId, pin: pin ?? "", companyName };
  } catch (err) {
    const isInviteError = err instanceof HttpsError && !!(err.details as { reason?: string } | undefined)?.reason;
    if (!isInviteError) log(step, err);
    await rollback(r);
    if (isInviteError) throw err;
    throw inviteError("generic");
  }
}

export const acceptEmployeeInvite = onCall({ memory: "512MiB" }, async (request) => {
  try {
    return await runAcceptEmployeeInvite(request.data);
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    log("unexpected", err);
    throw inviteError("generic");
  }
});
