"use client";

import { EmployeeInviteActions, type InviteActionsApi } from "@/components/dashboard/employees/EmployeeInviteActions";
import { InviteEmailBadge, InviteStatusBadge } from "@/components/dashboard/employees/EmployeeInviteStatusPill";
import { formatCompanyDateTime } from "@/lib/joinCodes/time";
import { inviteDisplayStatus } from "@/lib/employeeInvites/status";
import type { InviteActionResult } from "@/lib/hooks/useEmployeeInvites";
import type { EmployeeInviteCreateInput } from "@/lib/validators/employeeInvite";
import type { EmployeeInvite, JobSite } from "@/lib/types";

// "App invites" card on the Employees page (Phase 3B, decision P1): every
// Employee App invite with its status. Phase 9 (H1 a): sending a new one
// moved to the one invite form (InviteForm.tsx, role "Employee (app)"); the
// list stays here so old invites can still be resent, revoked or removed
// on any plan. "Invite to app" for an existing employee lives in their
// Edit window.

export interface AppInvitesApi extends InviteActionsApi {
  invites: EmployeeInvite[];
  loading: boolean;
  error: string | null;
  create: (input: EmployeeInviteCreateInput) => Promise<InviteActionResult>;
}

function siteName(sites: JobSite[], id: string | null) {
  if (!id) return "No site yet";
  return sites.find((s) => s.id === id)?.name ?? "Closed site";
}

function whenText(invite: EmployeeInvite) {
  const status = inviteDisplayStatus(invite);
  if (status === "accepted" && invite.acceptedAt) return `Joined ${formatCompanyDateTime(invite.acceptedAt.toMillis())}`;
  if (status === "pending" && invite.expiresAt) return `Expires ${formatCompanyDateTime(invite.expiresAt.toMillis())}`;
  if (status === "expired" && invite.expiresAt) return `Expired ${formatCompanyDateTime(invite.expiresAt.toMillis())}`;
  return "";
}

export function AppInvitesCard({ sites, api }: { sites: JobSite[]; api: AppInvitesApi }) {
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-950">App invites</h3>
          <p className="mt-1 text-sm text-gray-600">
            Email invites for the employee app. Each link works once and expires in 7 days. Resend gives a fresh 7 days.
          </p>
        </div>
        {api.error && <p className="border-b border-gray-200 px-6 py-3 text-sm text-red-600">{api.error}</p>}
        {api.loading ? (
          <p className="p-6 text-sm text-gray-600">Loading...</p>
        ) : api.invites.length === 0 ? (
          <p className="p-6 text-sm text-gray-600">No app invites sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">For</th>
                  <th className="px-6 py-3 font-medium">Job site</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Email status</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {api.invites.map((invite) => (
                  <tr key={invite.id} className="border-b border-gray-200 last:border-0">
                    <td className="px-6 py-4 text-gray-950">{invite.email}</td>
                    <td className="px-6 py-4 text-gray-600">{invite.kind === "existingEmployee" ? invite.employeeName || "Employee" : "New person"}</td>
                    <td className="px-6 py-4 text-gray-600">{invite.kind === "existingEmployee" ? "Their own sites" : siteName(sites, invite.siteId)}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <InviteStatusBadge invite={invite} />
                        <span className="text-xs text-gray-500">{whenText(invite)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <InviteEmailBadge invite={invite} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <EmployeeInviteActions invite={invite} api={api} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
