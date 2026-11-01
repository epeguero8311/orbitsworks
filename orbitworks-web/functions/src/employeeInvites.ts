import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { randomBytes, randomUUID } from "crypto";
import { z } from "zod";
import { db } from "./shared";
import { RESEND_API_KEY } from "./lib/resend";
import { checkInviteRateLimit, canResendEmail } from "./lib/inviteRateLimit";
import { employeeInviteLink, siteFor, NO_SITE_FOR_PROJECT } from "./lib/appUrls";
import { recordInviteEmailFailure, sendInviteEmailAndRecord } from "./lib/inviteEmailDelivery";
import { companyCanUseInvites, rowCanBeInvited, InviteCompany, InviteEmployeeRow } from "./lib/employeeInviteChecks";
import { buildEmployeeInviteEmail } from "./emailTemplates/employeeInviteEmail";
import { EMPLOYEE_INVITE_EXPIRY_DAYS, EMPLOYEE_INVITE_EXPIRY_MS, EmployeeInviteDoc, inviteDisplayStatus } from "./employeeInviteTypes";
import { createEmployeeInviteSchema, employeeInviteTokenSchema, INVITE_TOKEN_BYTES } from "./employeeInviteValidators";

// ---- Employee App email invites: admin side (Phase 3B) ----
//
// createEmployeeInvite   "Invite to app" (existing row) / "Invite new person"
// onEmployeeInviteCreated sends the email (same send path as supervisor
//                        invites: lib/inviteEmailDelivery.ts)
// resendEmployeeInvite   send again + a fresh 7 days, same link (G1)
// revokeEmployeeInvite   pending -> revoked, the link stops working (H1)
// removeEmployeeInvite   delete a revoked / accepted / expired invite (H1)
//
// Admin/owner of the invite's own company only. Every input is zod-checked
// before Firebase is touched. The sign-up itself is acceptEmployeeInvite.ts.

const MESSAGES = {
  plan: "Email invites need an active Core or Pro plan.",
  rowNotInvitable: "Only active employees without an app login can be invited. Employees with supervisor or admin access use those invites instead.",
  rowMissing: "Employee not found.",
  site: "That job site isn't available. Pick another or leave it blank.",
  pendingForEmail: "There's already a pending invite for that email.",
  pendingForRow: "This employee already has a pending invite.",
  emailHasLogin: "That email already has an OrbitsWorks login. Use a different email.",
  notFound: "Invite not found.",
  notPendingResend: "Only a pending or expired invite can be resent.",
  notPendingRevoke: "Only a pending invite can be revoked.",
  stillLive: "Revoke this invite before removing it.",
  cooldown: "Please wait a bit before resending this invite.",
  sendFailed: "Couldn't send the invite email.",
} as const;

function requireAdmin(request: CallableRequest): { uid: string; companyId: string } {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  if ((role !== "admin" && role !== "owner") || !companyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }
  return { uid: request.auth.uid, companyId };
}

function parse<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpsError("invalid-argument", r.error.issues[0]?.message || "Invalid request.");
  return r.data;
}

const companyRef = (companyId: string) => db.collection("companies").doc(companyId);
const invitesRef = () => db.collection("employeeInvites");

async function requireInvitePlan(companyId: string): Promise<InviteCompany> {
  const snap = await companyRef(companyId).get();
  const company = snap.exists ? (snap.data() as InviteCompany) : undefined;
  if (!companyCanUseInvites(company)) throw new HttpsError("failed-precondition", MESSAGES.plan);
  return company as InviteCompany;
}

// K1: no second live invite for the same email (employee OR supervisor/
// admin invite in this company), and the email isn't already a login.
// exceptToken skips the invite being resent.
async function assertEmailFree(companyId: string, email: string, exceptToken?: string): Promise<void> {
  const now = Date.now();
  const [employeeInvites, staffInvites] = await Promise.all([
    invitesRef().where("companyId", "==", companyId).where("email", "==", email).where("status", "==", "pending").get(),
    db.collection("invites").where("companyId", "==", companyId).where("email", "==", email).where("status", "==", "pending").limit(1).get(),
  ]);
  const liveEmployeeInvite = employeeInvites.docs.some(
    (d) => d.id !== exceptToken && inviteDisplayStatus(d.data() as EmployeeInviteDoc, now) === "pending"
  );
  if (liveEmployeeInvite || !staffInvites.empty) throw new HttpsError("already-exists", MESSAGES.pendingForEmail);
  try {
    await admin.auth().getUserByEmail(email);
    throw new HttpsError("already-exists", MESSAGES.emailHasLogin);
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }
}

async function assertRowFree(companyId: string, employeeId: string, exceptToken?: string): Promise<void> {
  const now = Date.now();
  const snap = await invitesRef().where("companyId", "==", companyId).where("employeeId", "==", employeeId).where("status", "==", "pending").get();
  const live = snap.docs.some((d) => d.id !== exceptToken && inviteDisplayStatus(d.data() as EmployeeInviteDoc, now) === "pending");
  if (live) throw new HttpsError("already-exists", MESSAGES.pendingForRow);
}

async function requireInvitableRow(companyId: string, employeeId: string): Promise<{ name: string }> {
  const snap = await companyRef(companyId).collection("employees").doc(employeeId).get();
  if (!snap.exists) throw new HttpsError("not-found", MESSAGES.rowMissing);
  const row = snap.data() as InviteEmployeeRow & { name?: string };
  if (!rowCanBeInvited(row)) throw new HttpsError("failed-precondition", MESSAGES.rowNotInvitable);
  return { name: String(row.name ?? "") };
}

// ---- create ----

export async function runCreateEmployeeInvite(request: CallableRequest): Promise<{ token: string; inviteId: string }> {
  const { uid, companyId } = requireAdmin(request);
  const input = parse(createEmployeeInviteSchema, request.data);

  await requireInvitePlan(companyId);

  let employeeId: string | null = null;
  let employeeName: string | null = null;
  let siteId: string | null = null;
  if (input.kind === "existingEmployee") {
    const row = await requireInvitableRow(companyId, input.employeeId);
    await assertRowFree(companyId, input.employeeId);
    employeeId = input.employeeId;
    employeeName = row.name;
  } else if (input.siteId !== null) {
    const site = await companyRef(companyId).collection("jobSites").doc(input.siteId).get();
    if (!site.exists || site.get("active") === false) throw new HttpsError("invalid-argument", MESSAGES.site);
    siteId = input.siteId;
  }
  await assertEmailFree(companyId, input.email);
  await checkInviteRateLimit(companyId, "employeeInvites");

  const token = randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
  const inviteId = randomUUID();
  const doc: Omit<EmployeeInviteDoc, "createdAt"> & { createdAt: admin.firestore.FieldValue } = {
    inviteId,
    companyId,
    kind: input.kind,
    email: input.email,
    employeeId,
    employeeName,
    siteId,
    status: "pending",
    invitedByUid: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + EMPLOYEE_INVITE_EXPIRY_MS),
    acceptedAt: null,
    acceptedByUid: null,
    revokedAt: null,
    revokedByUid: null,
    emailStatus: "pending",
    emailSentAt: null,
    emailError: null,
    lastEmailAttemptAt: null,
    resendCount: 0,
  };
  // create() so a (practically impossible) token clash fails instead of
  // overwriting someone else's invite.
  await invitesRef().doc(token).create(doc);
  return { token, inviteId };
}

export const createEmployeeInvite = onCall((request) => runCreateEmployeeInvite(request));

// ---- email ----

async function deliverEmployeeInviteEmail(ref: admin.firestore.DocumentReference, invite: EmployeeInviteDoc): Promise<boolean> {
  const link = employeeInviteLink(ref.id);
  const site = siteFor();
  if (!link || !site) {
    await recordInviteEmailFailure(ref, NO_SITE_FOR_PROJECT);
    return false;
  }
  const companySnap = await companyRef(invite.companyId).get();
  const company = companySnap.data() as { name?: string; logoUrl?: string | null } | undefined;
  const { subject, html } = buildEmployeeInviteEmail({
    companyName: company?.name || "your company",
    companyLogoUrl: company?.logoUrl ?? undefined,
    inviteLink: link,
    appName: site.appName,
    installFrom: site.installFrom,
    expiryDays: EMPLOYEE_INVITE_EXPIRY_DAYS,
  });
  return sendInviteEmailAndRecord(ref, { to: invite.email, subject, html });
}

export const onEmployeeInviteCreated = onDocumentCreated(
  { document: "employeeInvites/{token}", secrets: [RESEND_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const invite = snap.data() as EmployeeInviteDoc;
    if (!invite.email || !invite.companyId || invite.status !== "pending") return;
    await deliverEmployeeInviteEmail(snap.ref, invite);
  }
);

// Loads the invite for an admin action and checks it is theirs.
async function loadOwnInvite(companyId: string, token: string): Promise<{ ref: admin.firestore.DocumentReference; invite: EmployeeInviteDoc }> {
  const ref = invitesRef().doc(token);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", MESSAGES.notFound);
  const invite = snap.data() as EmployeeInviteDoc;
  // Same answer as "not found" so another company's tokens can't be probed.
  if (invite.companyId !== companyId) throw new HttpsError("not-found", MESSAGES.notFound);
  return { ref, invite };
}

// ---- resend (G1): pending or expired -> email again, fresh 7 days ----

export async function runResendEmployeeInvite(request: CallableRequest): Promise<{ success: true }> {
  const { companyId } = requireAdmin(request);
  const { token } = parse(employeeInviteTokenSchema, request.data);
  const { ref, invite } = await loadOwnInvite(companyId, token);

  if (invite.status !== "pending") throw new HttpsError("failed-precondition", MESSAGES.notPendingResend);
  if (!canResendEmail(invite.lastEmailAttemptAt)) throw new HttpsError("resource-exhausted", MESSAGES.cooldown);
  await requireInvitePlan(companyId);
  if (invite.kind === "existingEmployee" && invite.employeeId) {
    await requireInvitableRow(companyId, invite.employeeId);
    await assertRowFree(companyId, invite.employeeId, token);
  }
  await assertEmailFree(companyId, invite.email, token);

  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + EMPLOYEE_INVITE_EXPIRY_MS);
  await ref.update({ expiresAt, resendCount: admin.firestore.FieldValue.increment(1) });
  const sent = await deliverEmployeeInviteEmail(ref, { ...invite, expiresAt });
  if (!sent) {
    const after = (await ref.get()).data() as EmployeeInviteDoc;
    throw new HttpsError("internal", after.emailError || MESSAGES.sendFailed);
  }
  return { success: true };
}

export const resendEmployeeInvite = onCall({ secrets: [RESEND_API_KEY] }, (request) => runResendEmployeeInvite(request));

// ---- revoke (H1): pending -> revoked. In a transaction so it can't race
// a sign-up that is accepting the same invite. ----

export async function runRevokeEmployeeInvite(request: CallableRequest): Promise<{ success: true }> {
  const { uid, companyId } = requireAdmin(request);
  const { token } = parse(employeeInviteTokenSchema, request.data);
  const ref = invitesRef().doc(token);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const invite = snap.exists ? (snap.data() as EmployeeInviteDoc) : undefined;
    if (!invite || invite.companyId !== companyId) throw new HttpsError("not-found", MESSAGES.notFound);
    if (invite.status !== "pending") throw new HttpsError("failed-precondition", MESSAGES.notPendingRevoke);
    tx.update(ref, { status: "revoked", revokedAt: admin.firestore.FieldValue.serverTimestamp(), revokedByUid: uid });
  });
  return { success: true };
}

export const revokeEmployeeInvite = onCall((request) => runRevokeEmployeeInvite(request));

// ---- remove (H1): delete a dead invite (revoked / accepted / expired) ----

export async function runRemoveEmployeeInvite(request: CallableRequest): Promise<{ success: true }> {
  const { companyId } = requireAdmin(request);
  const { token } = parse(employeeInviteTokenSchema, request.data);
  const ref = invitesRef().doc(token);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const invite = snap.exists ? (snap.data() as EmployeeInviteDoc) : undefined;
    if (!invite || invite.companyId !== companyId) throw new HttpsError("not-found", MESSAGES.notFound);
    if (inviteDisplayStatus(invite) === "pending") throw new HttpsError("failed-precondition", MESSAGES.stillLive);
    tx.delete(ref);
  });
  return { success: true };
}

export const removeEmployeeInvite = onCall((request) => runRemoveEmployeeInvite(request));

// Used by deleteEmployee (employees.ts): a deleted row's pending invites
// are revoked in the same batch, so its link dies with the row.
export async function pendingInviteRefsForRow(companyId: string, employeeId: string): Promise<admin.firestore.DocumentReference[]> {
  const snap = await invitesRef().where("companyId", "==", companyId).where("employeeId", "==", employeeId).where("status", "==", "pending").get();
  return snap.docs.map((d) => d.ref);
}
