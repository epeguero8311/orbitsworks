"use client";

import { useState, type FormEvent } from "react";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { useStaffInviteSend } from "@/lib/hooks/useStaffInviteSend";
import { INVITE_ROLES, inviteRoleBlock, seatsText } from "@/lib/inviteRoles";
import { inviteFormSchema } from "@/lib/validators/employeeInvite";
import type { InviteActionResult } from "@/lib/hooks/useEmployeeInvites";
import type { EmployeeInviteCreateInput } from "@/lib/validators/employeeInvite";
import type { InviteRole, JobSite } from "@/lib/types";

// Phase 9 (H1 a): the ONE invite form on the Employees page - email + a
// role dropdown. Each role keeps its own path and checks:
//   Employee (app) -> createEmployeeInvite (App invites list below)
//   Supervisor     -> an invites doc with job sites (Supervisors list)
//   Admin          -> an invites doc (Admins list)
// H2 a: a role that can't be used right now stays in the list, greyed out,
// with the reason. H3 a + J1 a: every role shows the seats left and can't
// be sent at 0 - an admin takes a seat too (the server checks seats again
// when it is accepted).
// To give an EXISTING employee the app or supervisor access, use their
// Edit window as before.
const inputClass =
  "w-full max-w-sm rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const labelClass = "mb-2 block text-sm font-medium text-gray-950";

interface InviteFormProps {
  sites: JobSite[];
  createAppInvite: (input: EmployeeInviteCreateInput) => Promise<InviteActionResult>;
}

export function InviteForm({ sites, createAppInvite }: InviteFormProps) {
  const { canUseInvites, pastDue, seatsLeft, activeCap, loading } = useCompanySettings();
  const staff = useStaffInviteSend();
  const [role, setRole] = useState<InviteRole>("employee");
  const [email, setEmail] = useState("");
  const [siteId, setSiteId] = useState("");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const plan = { canUseAppInvites: canUseInvites, pastDue, seatsLeft };
  const block = loading ? null : inviteRoleBlock(role, plan);
  const showSeats = seatsText(seatsLeft, activeCap);
  const busy = sending || staff.sending;

  function toggleSite(id: string) {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || block) return;
    setMessage(null);
    const draft = role === "employee" ? { role, email, siteId: siteId || null } : role === "supervisor" ? { role, email, siteIds } : { role, email };
    const parsed = inviteFormSchema.safeParse(draft);
    if (!parsed.success) return setMessage({ text: parsed.error.issues[0]?.message ?? "Check the form.", isError: true });
    setSending(true);
    const input = parsed.data;
    const res =
      input.role === "employee"
        ? await createAppInvite({ kind: "newPerson", email: input.email, siteId: input.siteId })
        : await staff.send(input.role, input.email, input.role === "supervisor" ? input.siteIds : []);
    setSending(false);
    if (res.ok) {
      setMessage({ text: `Invite sent to ${input.email}.`, isError: false });
      setEmail("");
      setSiteId("");
      setSiteIds([]);
    } else {
      setMessage({ text: res.message, isError: true });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">Invite someone</h2>
      <p className="mt-1 text-sm text-gray-600">
        Pick what they are. Employees get the employee app; supervisors get the supervisor app; admins get the website. To give an existing
        employee the app or supervisor access, open their record.
      </p>

      <div className="mt-5 flex flex-wrap gap-4">
        <div>
          <label htmlFor="inviteRole" className={labelClass}>Role</label>
          <select id="inviteRole" value={role} onChange={(e) => { setRole(e.target.value as InviteRole); setMessage(null); }} className={inputClass}>
            {INVITE_ROLES.map((r) => {
              const why = loading ? null : inviteRoleBlock(r.role, plan);
              return (
                <option key={r.role} value={r.role} disabled={!!why && r.role !== role}>
                  {r.label}{why ? " (not available)" : ""}
                </option>
              );
            })}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label htmlFor="inviteEmail" className={labelClass}>Email</label>
          <input id="inviteEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="name@company.com" />
        </div>
      </div>

      {role === "employee" && (
        <div className="mt-5">
          <label htmlFor="inviteSite" className={labelClass}>Job site (optional)</label>
          <select id="inviteSite" value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputClass}>
            <option value="">No site yet - assign one later</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-600">They get an email link to sign up in the employee app. It works once and expires in 7 days.</p>
        </div>
      )}

      {role === "supervisor" && (
        <div className="mt-5">
          <span className={labelClass}>Assign to job sites</span>
          {sites.length === 0 ? (
            <p className="text-sm text-gray-600">No active job sites yet - add one on the Job Sites page first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sites.map((site) => (
                <label key={site.id} className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors ${siteIds.includes(site.id) ? "border-accent bg-accent/10 text-accent" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  <input type="checkbox" className="hidden" checked={siteIds.includes(site.id)} onChange={() => toggleSite(site.id)} />
                  {site.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {role === "admin" && <p className="mt-5 text-sm text-gray-600">Admins get full website access - employees, sites, timesheets and everything else except billing.</p>}

      {showSeats && <p className="mt-4 text-xs text-gray-600">{showSeats}</p>}
      {block && <p className="mt-4 text-sm text-amber-700">{block}</p>}
      {message && <p className={`mt-4 text-sm ${message.isError ? "text-red-600" : "text-green-700"}`}>{message.text}</p>}

      <button type="submit" disabled={busy || !!block} className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60">
        {busy ? "Sending..." : "Send invite"}
      </button>
    </form>
  );
}
