import { inviteDisplayStatus } from "@/lib/employeeInvites/status";
import type { EmployeeInvite, EmployeeInviteDisplayStatus } from "@/lib/types";

// Status pills for Employee App invites (Phase 3B).

const STATUS: Record<EmployeeInviteDisplayStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700" },
  expired: { label: "Expired", className: "bg-gray-100 text-gray-600" },
  accepted: { label: "Accepted", className: "bg-green-50 text-green-700" },
  revoked: { label: "Revoked", className: "bg-red-50 text-red-700" },
};

const pill = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

export function InviteStatusBadge({ invite }: { invite: EmployeeInvite }) {
  const s = STATUS[inviteDisplayStatus(invite)];
  return <span className={`${pill} ${s.className}`}>{s.label}</span>;
}

// Whether the email went out. Accepted invites are resolved whatever it says.
export function InviteEmailBadge({ invite }: { invite: EmployeeInvite }) {
  if (invite.status === "accepted" || invite.emailStatus === "sent") return <span className={`${pill} bg-green-50 text-green-700`}>Sent</span>;
  if (invite.emailStatus === "failed") {
    return (
      <span className={`${pill} bg-red-50 text-red-700`} title={invite.emailError ?? undefined}>
        Failed
      </span>
    );
  }
  return <span className={`${pill} bg-gray-100 text-gray-600`}>Sending...</span>;
}

// Small pill next to an employee's name in the Employees table: only while
// an "Invite to app" invite is pending or has expired unused.
export function EmployeeInviteStatusPill({ invite }: { invite: EmployeeInvite | undefined }) {
  if (!invite) return null;
  const status = inviteDisplayStatus(invite);
  if (status === "pending") return <span className={`${pill} bg-amber-50 text-amber-700`}>App invite sent</span>;
  if (status === "expired") return <span className={`${pill} bg-gray-100 text-gray-600`}>App invite expired</span>;
  return null;
}
