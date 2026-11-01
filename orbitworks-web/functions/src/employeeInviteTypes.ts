import type * as admin from "firebase-admin";

// ---- Employee App: email invites (Phase 3B) ----
//
// employeeInvites/{token}. The doc id IS the secret link token (same idea
// as joinCodes/{token}): {site}/i/{token}. Written only by the Admin SDK
// (firestore.rules denies every client write). Admins/owners of the same
// company can read them (they need the token for Copy link).
//
// inviteId is a separate stable id. It is what goes on the employee doc
// and the consent record - never the token, because the employee can read
// their own employee doc.
//
// Keep in sync by hand with EmployeeInvite in the website's lib/types.ts.

export const EMPLOYEE_INVITE_EXPIRY_DAYS = 7;
export const EMPLOYEE_INVITE_EXPIRY_MS = EMPLOYEE_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// "expired" is never stored: a pending invite whose expiresAt has passed
// shows (and is treated) as expired. Resend sets a fresh expiresAt.
export type EmployeeInviteStatus = "pending" | "accepted" | "revoked";
export type EmployeeInviteDisplayStatus = EmployeeInviteStatus | "expired";

// existingEmployee = "Invite to app" on an employee row: accept links the
// login to that row (keeps PIN + history). newPerson = "Invite new person":
// accept creates the row.
export type EmployeeInviteKind = "existingEmployee" | "newPerson";

export type InviteEmailStatus = "pending" | "sent" | "failed";

export interface EmployeeInviteDoc {
  inviteId: string;
  companyId: string;
  kind: EmployeeInviteKind;
  // Lowercased, trimmed. Sign-up email must match it.
  email: string;
  // existingEmployee: the row being linked (set at create). newPerson: null
  // until accept, then the row it created.
  employeeId: string | null;
  // existingEmployee only: the row's name when the invite was sent, for
  // the invite list. Accept always uses the row's live name (decision I1).
  employeeName: string | null;
  // newPerson only. null = no site until an admin assigns one.
  // existingEmployee keeps the row's own sites, so this is always null.
  siteId: string | null;
  status: EmployeeInviteStatus;
  invitedByUid: string;
  createdAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
  acceptedAt: admin.firestore.Timestamp | null;
  acceptedByUid: string | null;
  revokedAt: admin.firestore.Timestamp | null;
  revokedByUid: string | null;
  // Set by the email send path only (same fields as invites/{id}).
  emailStatus: InviteEmailStatus;
  emailSentAt: admin.firestore.Timestamp | null;
  emailError: string | null;
  lastEmailAttemptAt: admin.firestore.Timestamp | null;
  resendCount: number;
}

// What a pending invite shows as right now.
export function inviteDisplayStatus(
  invite: Pick<EmployeeInviteDoc, "status" | "expiresAt">,
  nowMs: number = Date.now()
): EmployeeInviteDisplayStatus {
  if (invite.status === "pending" && invite.expiresAt.toMillis() <= nowMs) return "expired";
  return invite.status;
}
