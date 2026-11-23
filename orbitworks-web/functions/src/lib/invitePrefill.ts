import type { EmployeeInviteDoc, InvitePrefill } from "../employeeInviteTypes";
import { invitePrefillSchema } from "../employeeInviteValidators";

// ---- Phase 5d: invite autofill ----
//
// What getInviteInfo sends so the sign-up form starts filled in. Built only
// from server docs (the invite and, for "Invite to app", its employee row),
// and only called once inviteProblem() said the invite is usable right now.
// Cleaned by invitePrefillSchema: bad email -> null (empty form), any other
// bad field -> null for that field. Never throws.
//
// Fields (see InvitePrefill): email always; name, birthday and
// subcontractor only from an existing row. A newPerson invite stores no
// name, so its name box stays empty. Phone, PIN, rate, sites, photo are
// never sent - the sign-up form has no box for them.

export interface PrefillRow {
  name?: unknown;
  dob?: unknown;
  subcontractorId?: unknown;
}

export function buildInvitePrefill(args: {
  invite: Pick<EmployeeInviteDoc, "email" | "kind">;
  row?: PrefillRow | undefined;
  // The active list sent with the same answer: the row's subcontractor is
  // only prefilled if the person can actually pick it.
  subcontractorIds: string[];
}): InvitePrefill | null {
  try {
    const { invite, subcontractorIds } = args;
    const row = invite.kind === "existingEmployee" ? args.row : undefined;
    const subId = row && typeof row.subcontractorId === "string" && subcontractorIds.includes(row.subcontractorId) ? row.subcontractorId : null;
    const parsed = invitePrefillSchema.safeParse({
      email: invite.email,
      fullName: row && typeof row.name === "string" ? row.name : null,
      birthday: row && typeof row.dob === "string" ? row.dob : null,
      subcontractorId: subId,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
