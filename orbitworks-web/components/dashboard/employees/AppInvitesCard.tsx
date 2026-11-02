"use client";

import { useState, type FormEvent } from "react";
import { EmployeeInviteActions, type InviteActionsApi } from "@/components/dashboard/employees/EmployeeInviteActions";
import { InviteEmailBadge, InviteStatusBadge } from "@/components/dashboard/employees/EmployeeInviteStatusPill";
import { formatCompanyDateTime } from "@/lib/joinCodes/time";
import { INVITE_PLAN_MESSAGE, inviteDisplayStatus } from "@/lib/employeeInvites/status";
import type { InviteActionResult } from "@/lib/hooks/useEmployeeInvites";
import type { EmployeeInviteCreateInput } from "@/lib/validators/employeeInvite";
import type { EmployeeInvite, JobSite } from "@/lib/types";

// "App invites" card on the Employees page (Phase 3B, decision P1): the
// "Invite new person" form and every Employee App invite with its status.
// "Invite to app" for an existing employee lives in their Edit window.
// canInvite: Core/Pro and not past_due (null while the plan loads). Without
// it the form is replaced by INVITE_PLAN_MESSAGE; the list stays so old
// invites can still be revoked or removed.

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

export function AppInvitesCard({ sites, api, canInvite }: { sites: JobSite[]; api: AppInvitesApi; canInvite: boolean | null }) {
  const [email, setEmail] = useState("");
  const [siteId, setSiteId] = useState("");
  const [sending, setSending] = useState(false);
  const [formMessage, setFormMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setFormMessage(null);
    const res = await api.create({ kind: "newPerson", email, siteId: siteId || null });
    setSending(false);
    if (res.ok) {
      setFormMessage({ text: `Invite sent to ${email.trim().toLowerCase()}.`, isError: false });
      setEmail("");
      setSiteId("");
    } else {
      setFormMessage({ text: res.message, isError: true });
    }
  }

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

      <h2 className="mt-10 text-xl font-semibold text-gray-950">Invite new person</h2>
      <p className="mt-1.5 text-sm text-gray-600">
        Email someone a link to sign up in the employee app. Their employee record is created when they sign up. To give an
        existing employee the app, open their record and use Invite to app.
      </p>
      {canInvite === false && <p className="mt-5 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">{INVITE_PLAN_MESSAGE}</p>}
      {canInvite && (
        <form onSubmit={handleSubmit} className="mt-5 rounded-xl border border-gray-200 bg-white p-6">
          <label htmlFor="appInviteEmail" className="mb-2 block text-sm font-medium text-gray-950">
            Email
          </label>
          <input
            id="appInviteEmail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder="worker@email.com"
          />
          <label htmlFor="appInviteSite" className="mb-2 mt-5 block text-sm font-medium text-gray-950">
            Job site (optional)
          </label>
          <select
            id="appInviteSite"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">No site yet - assign one later</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {formMessage && <p className={`mt-4 text-sm ${formMessage.isError ? "text-red-600" : "text-green-700"}`}>{formMessage.text}</p>}
          <button
            type="submit"
            disabled={sending}
            className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {sending ? "Sending..." : "Send invite"}
          </button>
        </form>
      )}
    </div>
  );
}
