"use client";

import { useState } from "react";
import { EmployeeInviteActions, type InviteActionsApi } from "@/components/dashboard/employees/EmployeeInviteActions";
import { InviteEmailBadge, InviteStatusBadge } from "@/components/dashboard/employees/EmployeeInviteStatusPill";
import { formatCompanyDateTime } from "@/lib/joinCodes/time";
import { INVITE_PLAN_MESSAGE, inviteDisplayStatus, rowCanBeInvited } from "@/lib/employeeInvites/status";
import type { InviteActionResult } from "@/lib/hooks/useEmployeeInvites";
import type { EmployeeInviteCreateInput } from "@/lib/validators/employeeInvite";
import type { Employee, EmployeeInvite } from "@/lib/types";

// "Employee app" section of the Edit employee window (Phase 3B): Invite to
// app for THIS row. Accepting links the new login to this same record, so
// the PIN, sites, rate and clock history stay. One live invite per row.

export interface EmployeeAppInviteApi extends InviteActionsApi {
  create: (input: EmployeeInviteCreateInput) => Promise<InviteActionResult>;
}

function why(employee: Employee): string | null {
  if (employee.appAccess) return "Has the employee app.";
  if (employee.linkedUserId) return null; // supervisor/admin login: nothing to show here
  if (employee.isSupervisor || employee.isAdmin) return "Employees with supervisor or admin access use those invites instead.";
  if (!employee.active) return "Reactivate this employee to invite them to the app.";
  return null;
}

// planOk: Core/Pro and not past_due (null while the plan loads). Without
// it the Invite to app button is replaced by INVITE_PLAN_MESSAGE.
export function EmployeeAppInviteSection({ employee, invite, api, planOk }: { employee: Employee; invite: EmployeeInvite | undefined; api: EmployeeAppInviteApi; planOk: boolean | null }) {
  const [email, setEmail] = useState(employee.email ?? "");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const status = invite ? inviteDisplayStatus(invite) : null;
  const live = status === "pending";
  const canInvite = rowCanBeInvited(employee);
  const note = why(employee);
  if (!canInvite && !note) return null;

  async function send() {
    if (sending) return;
    setSending(true);
    setMessage(null);
    const res = await api.create({ kind: "existingEmployee", employeeId: employee.id, email });
    setSending(false);
    setMessage(res.ok ? { text: `Invite sent to ${email.trim().toLowerCase()}.`, isError: false } : { text: res.message, isError: true });
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-medium text-gray-950">Employee app</p>
      {note && <p className="mt-1 text-sm text-gray-600">{note}</p>}

      {canInvite && invite && status !== "accepted" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-gray-950">{invite.email}</span>
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <InviteStatusBadge invite={invite} />
              <InviteEmailBadge invite={invite} />
              {live && invite.expiresAt ? `Expires ${formatCompanyDateTime(invite.expiresAt.toMillis())}` : null}
            </span>
          </div>
          <EmployeeInviteActions invite={invite} api={api} />
        </div>
      )}

      {canInvite && !live && planOk === false && <p className="mt-3 text-sm text-gray-600">{INVITE_PLAN_MESSAGE}</p>}

      {canInvite && !live && planOk && (
        <div className="mt-3">
          <p className="text-sm text-gray-600">
            Email {employee.name} a link to set up the employee app. Their PIN, job sites and clock history stay the same.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="worker@email.com"
              aria-label="Email to invite"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !email.trim()}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {sending ? "Sending..." : "Invite to app"}
            </button>
          </div>
        </div>
      )}

      {message && <p className={`mt-3 text-sm ${message.isError ? "text-red-600" : "text-green-700"}`}>{message.text}</p>}
    </div>
  );
}
