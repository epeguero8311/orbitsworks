import { z } from "zod";
import { emailField, idField, joinCompanySchema, joinTokenField } from "./joinCompanyValidators";

// ---- Employee App email invite inputs (Phase 3B) ----
//
// Every invite callable parses its input with one of these BEFORE touching
// Firebase. The website's lib/validators/employeeInvite.ts has the same
// rules for the admin form - keep both in sync by hand.

// 32 random bytes as base64url = 43 chars. Same accepted range as crew
// code tokens, so the app's link check is one rule for both.
export const INVITE_TOKEN_BYTES = 32;
export const inviteTokenField = joinTokenField;

// Admin: create an invite. companyId always comes from the caller's
// claims, never the body.
//   existingEmployee - "Invite to app" on an employee row. The row's own
//                      sites are kept, so there is no siteId.
//   newPerson        - "Invite new person". siteId null = no site yet.
export const createEmployeeInviteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existingEmployee"), employeeId: idField, email: emailField }),
  z.object({ kind: z.literal("newPerson"), email: emailField, siteId: idField.nullable() }),
]);
export type CreateEmployeeInviteInput = z.infer<typeof createEmployeeInviteSchema>;

// Admin: resend / revoke / remove one invite.
export const employeeInviteTokenSchema = z.object({ token: inviteTokenField });

// Public: what an invite link shows before sign-up. Anything that fails
// this is answered "no longer active", same as getJoinInfo.
export const getInviteInfoSchema = z.object({ token: inviteTokenField });

// Public: the sign-up itself. Exactly the QR sign-up fields (same name,
// email, password, consent, birthday, subcontractor and selfie rules); only
// the token means an invite instead of a crew code.
export const acceptEmployeeInviteSchema = joinCompanySchema.extend({ token: inviteTokenField });
export type AcceptEmployeeInviteInput = z.infer<typeof acceptEmployeeInviteSchema>;

// Error reasons the app maps to screens (details.reason on the HttpsError).
// The app's lib/validators/joinSignup.js mapJoinError knows these names.
//   inviteInactive  bad / unknown / expired / revoked / already used link
//   inviteUnusable  existing-row invite whose row is now inactive or
//                   already has a login (re-checked at accept)
//   emailMismatch   sign-up email isn't the invited email
export const INVITE_ERRORS = {
  inviteInactive: "This invite is no longer active. Ask your admin to send a new one.",
  inviteUnusable: "This invite can't be used anymore. Ask your admin to send a new one.",
  emailMismatch: "Use the email address this invite was sent to.",
} as const;
export type InviteErrorReason = keyof typeof INVITE_ERRORS;
