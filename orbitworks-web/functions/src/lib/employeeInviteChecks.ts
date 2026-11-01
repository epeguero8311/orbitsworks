import { EmployeeInviteDoc, inviteDisplayStatus } from "../employeeInviteTypes";
import { isCoreOrProPlan, overSeatCaps } from "./signupShared";

// The one place that decides whether an email invite can be used right
// now. getInviteInfo (what the link shows), acceptEmployeeInvite's quick
// pre-check and its transaction all call this, so they can never disagree.
//
//   inviteInactive  no invite / not pending / expired (revoked and already
//                   used are "not pending")
//   accountProblem  company missing, not Core or Pro, past due, or (new
//                   person) no seat left
//   inviteUnusable  existing-row invite whose row is gone, inactive, or
//                   already has a login (re-checked at accept)
// The email match is checked separately (only accept has an email).

export type InviteProblem = "inviteInactive" | "accountProblem" | "inviteUnusable";

export interface InviteCompany {
  name?: string;
  planTier?: string | null;
  subscriptionStatus?: string;
  employeeCap?: number | null;
  totalEmployeeCap?: number | null;
}

export interface InviteEmployeeRow {
  active?: boolean;
  linkedUserId?: string | null;
  appAccess?: boolean;
  isSupervisor?: boolean;
  isAdmin?: boolean;
}

// Plan + billing gate shared with createEmployeeInvite / resend (L1).
export function companyCanUseInvites(company: InviteCompany | undefined): boolean {
  return !!company && isCoreOrProPlan(company.planTier) && company.subscriptionStatus !== "past_due";
}

// Which employee rows can get "Invite to app" (J1): active, no login yet.
// Rows with supervisor/admin access use the existing Supervisor/Admin
// invite flow instead, so they are left out here too.
export function rowCanBeInvited(row: InviteEmployeeRow | undefined): boolean {
  if (!row) return false;
  if (row.active !== true) return false;
  if (row.linkedUserId || row.appAccess) return false;
  return !row.isSupervisor && !row.isAdmin;
}

export function inviteProblem(args: {
  invite: Pick<EmployeeInviteDoc, "status" | "expiresAt" | "kind"> | undefined;
  company: InviteCompany | undefined;
  // existingEmployee only: the row being linked (undefined = row is gone).
  row?: InviteEmployeeRow | undefined;
  // newPerson only: live counts for the seat check.
  counts?: { active: number; total: number };
  nowMs?: number;
}): InviteProblem | null {
  const { invite, company, row, counts } = args;
  if (!invite) return "inviteInactive";
  if (inviteDisplayStatus(invite, args.nowMs) !== "pending") return "inviteInactive";
  if (!companyCanUseInvites(company)) return "accountProblem";
  if (invite.kind === "existingEmployee") {
    return rowCanBeInvited(row) ? null : "inviteUnusable";
  }
  // newPerson: adds one active employee.
  if (!counts || overSeatCaps(company, counts)) return "accountProblem";
  return null;
}
