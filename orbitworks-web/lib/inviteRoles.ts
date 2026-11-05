import type { InviteRole } from "@/lib/types";

// Phase 9 (H1-H3): which roles the one invite form can send right now.
// Pure, no Firebase - unit tested in test/inviteRoles.test.mjs. The server
// still checks everything when the invite is accepted.
//   H2 a: a role that can't be used is shown greyed out with this reason.
//   H3 a: Employee and Supervisor need a free seat (seatsLeft null = no cap).

export const INVITE_ROLES: { role: InviteRole; label: string }[] = [
  { role: "employee", label: "Employee (app)" },
  { role: "supervisor", label: "Supervisor" },
  { role: "admin", label: "Admin" },
];

export const NO_SEATS_TEXT = "No seats left on your plan. Upgrade or deactivate someone first.";
export const PAST_DUE_TEXT = "Your subscription is past due.";
export const APP_INVITES_PLAN_TEXT = "Employee app invites need a Core or Pro plan.";

export interface InvitePlanState {
  canUseAppInvites: boolean; // Core/Pro and not past_due
  pastDue: boolean;
  seatsLeft: number | null; // null = no cap
}

// null = can send; otherwise why not, in plain words.
export function inviteRoleBlock(role: InviteRole, plan: InvitePlanState): string | null {
  if (plan.pastDue) return PAST_DUE_TEXT;
  if (role === "employee" && !plan.canUseAppInvites) return APP_INVITES_PLAN_TEXT;
  if ((role === "employee" || role === "supervisor") && plan.seatsLeft !== null && plan.seatsLeft <= 0) return NO_SEATS_TEXT;
  return null;
}

// "3 of 10 seats left" (null cap = nothing to say).
export function seatsText(seatsLeft: number | null, activeCap: number | null): string {
  if (activeCap === null || seatsLeft === null) return "";
  return `${seatsLeft} of ${activeCap} seat${activeCap === 1 ? "" : "s"} left`;
}
