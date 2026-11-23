import { z } from "zod";

// Inputs for Employee App email invites (Phase 3B), checked on the admin
// form before calling the server. The functions package's
// employeeInviteValidators.ts is the real check - keep the rules in sync
// by hand. companyId always comes from the caller's claims, never the body.

const ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;
const idField = z.string().regex(ID_REGEX);

// Same rule as crew code tokens (joinCodeTokenField).
export const employeeInviteTokenField = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "Invalid invite");

const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email."));

//   existingEmployee - "Invite to app" on an employee row (keeps its sites)
//   newPerson        - "Invite new person"; siteId null = no site yet
export const employeeInviteCreateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existingEmployee"), employeeId: idField, email: emailField }),
  z.object({ kind: z.literal("newPerson"), email: emailField, siteId: idField.nullable() }),
]);

// Resend / revoke / remove.
export const employeeInviteTokenSchema = z.object({ token: employeeInviteTokenField });

export type EmployeeInviteCreateInput = z.infer<typeof employeeInviteCreateSchema>;

// ---- Phase 9 (H1 a): the one invite form on the Employees page ----
//
// One form, a role dropdown. Each role keeps its own send path and checks:
//   employee   -> employeeInviteCreateSchema newPerson (createEmployeeInvite)
//   supervisor -> an invites doc with the picked job sites
//   admin      -> an invites doc, no job sites
// Same email rule for all three.
export const inviteFormSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("employee"), email: emailField, siteId: idField.nullable() }),
  z.object({ role: z.literal("supervisor"), email: emailField, siteIds: z.array(idField).max(200) }),
  z.object({ role: z.literal("admin"), email: emailField }),
]);

export type InviteFormInput = z.infer<typeof inviteFormSchema>;
