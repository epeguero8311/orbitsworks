"use client";

import { useMemo, useState, type ReactNode } from "react";
import { EmployeeInviteActions, type InviteActionsApi } from "@/components/dashboard/employees/EmployeeInviteActions";
import { InviteEmailBadge, InviteStatusBadge } from "@/components/dashboard/employees/EmployeeInviteStatusPill";
import { RoleTagPill } from "@/components/dashboard/employees/EmployeeRoleTag";
import { StaffInviteActions } from "@/components/dashboard/employees/StaffInviteActions";
import { useInvites } from "@/lib/hooks/useInvites";
import { inviteDisplayStatus } from "@/lib/employeeInvites/status";
import { accountTags } from "@/lib/accountTags";
import type { EmployeeRoleTagKind } from "@/lib/employeeRoleTag";
import type { InviteActionResult } from "@/lib/hooks/useEmployeeInvites";
import type { EmployeeInviteCreateInput } from "@/lib/validators/employeeInvite";
import type { Employee, EmployeeInvite, Invite, JobSite, Subcontractor } from "@/lib/types";

// Task 5 v2 (2): ONE "Invites" section (was App invites + Supervisors +
// Admins). Collapsible, closed on every page load; filters reset on every
// load too (plain component state). Tags = the account's current tags once
// accepted (Employee app + Admin shows both), else the invited role.

export interface AppInvitesApi extends InviteActionsApi {
  invites: EmployeeInvite[];
  loading: boolean;
  error: string | null;
  create: (input: EmployeeInviteCreateInput) => Promise<InviteActionResult>;
}

type StatusKey = "pending" | "accepted" | "expired" | "revoked";

type Row = {
  key: string;
  email: string;
  tags: EmployeeRoleTagKind[];
  companyId: string; // subcontractor id, "" = none
  siteIds: string[];
  siteText: string;
  status: StatusKey;
  statusCell: ReactNode;
  emailCell: ReactNode;
  actions: ReactNode;
  sortMs: number;
};

const TAG_OPTIONS: { value: EmployeeRoleTagKind; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "supervisor", label: "Supervisor" },
  { value: "kiosk", label: "Kiosk" },
  { value: "admin", label: "Admin" },
];
const STATUS_OPTIONS: { value: StatusKey; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

const selectClass = "rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent";

function staffEmailBadge(invite: Invite) {
  if (invite.status === "accepted" || invite.emailStatus === "sent") return { text: "Sent", className: "bg-green-50 text-green-700" };
  if (invite.emailStatus === "failed") return { text: "Failed", className: "bg-red-50 text-red-700" };
  return { text: "Sending...", className: "bg-gray-100 text-gray-600" };
}

function pill(text: string, className: string) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{text}</span>;
}

export function InvitesSection({
  api,
  employees,
  sites,
  subcontractors,
}: {
  api: AppInvitesApi;
  employees: Employee[];
  sites: JobSite[];
  subcontractors: Subcontractor[];
}) {
  const staff = useInvites();
  const [open, setOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(employees.map((e) => [e.id, e]));
    const byUid = new Map(employees.filter((e) => e.linkedUserId).map((e) => [e.linkedUserId as string, e]));
    const siteNames = (ids: string[]) => ids.map((id) => sites.find((s) => s.id === id)?.name).filter(Boolean).join(", ") || "-";

    const appRows: Row[] = api.invites.map((invite) => {
      const status = inviteDisplayStatus(invite);
      const emp = invite.employeeId ? byId.get(invite.employeeId) : undefined;
      const tags = status === "accepted" && emp ? accountTags(emp) : (["employee"] as EmployeeRoleTagKind[]);
      const siteIds = emp ? emp.assignedSiteIds ?? [] : invite.siteId ? [invite.siteId] : [];
      return {
        key: `app-${invite.id}`,
        email: invite.email,
        tags: tags.length ? tags : ["employee"],
        companyId: emp?.subcontractorId ?? "",
        siteIds,
        siteText: siteNames(siteIds),
        status,
        statusCell: <InviteStatusBadge invite={invite} />,
        emailCell: <InviteEmailBadge invite={invite} />,
        actions: <EmployeeInviteActions invite={invite} api={api} />,
        sortMs: invite.createdAt?.toMillis?.() ?? 0,
      };
    });

    const staffRows: Row[] = staff.invites.map((invite) => {
      const accepted = invite.status === "accepted";
      const emp = accepted && invite.acceptedByUid ? byUid.get(invite.acceptedByUid) : invite.linkExistingEmployeeId ? byId.get(invite.linkExistingEmployeeId) : undefined;
      const tags = accepted && emp ? accountTags(emp) : ([invite.role] as EmployeeRoleTagKind[]);
      const siteIds = emp ? emp.assignedSiteIds ?? [] : invite.assignedSiteIds ?? [];
      const badge = staffEmailBadge(invite);
      return {
        key: `staff-${invite.id}`,
        email: invite.email,
        tags: tags.length ? tags : [invite.role],
        companyId: tags.includes("admin") ? "" : emp?.subcontractorId ?? "",
        siteIds,
        siteText: invite.role === "admin" && !emp ? "-" : siteNames(siteIds),
        status: accepted ? "accepted" : "pending",
        statusCell: pill(accepted ? "Accepted" : "Pending", accepted ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"),
        emailCell: pill(badge.text, badge.className),
        actions: <StaffInviteActions invite={invite} onCancel={staff.cancelInvite} />,
        sortMs: invite.createdAt?.toMillis?.() ?? 0,
      };
    });

    return [...appRows, ...staffRows].sort((a, b) => b.sortMs - a.sortMs);
  }, [api, staff.invites, staff.cancelInvite, employees, sites]);

  const shown = rows.filter(
    (r) =>
      (companyFilter === "all" || r.companyId === (companyFilter === "none" ? "" : companyFilter)) &&
      (siteFilter === "all" || r.siteIds.includes(siteFilter)) &&
      (tagFilter === "all" || r.tags.includes(tagFilter as EmployeeRoleTagKind)) &&
      (statusFilter === "all" || r.status === statusFilter)
  );
  const subName = (id: string) => (id ? subcontractors.find((s) => s.id === id)?.name ?? "-" : "-");
  const loading = api.loading || staff.loading;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-6 py-4 text-left"
      >
        <span>
          <span className="block text-base font-semibold text-gray-950">Invites ({rows.length})</span>
          <span className="mt-1 block text-sm text-gray-600">
            Email invites. Each link works once and expires in 7 days. Resend gives a fresh 7 days.
          </span>
        </span>
        <span className="mt-1 text-sm text-gray-600" aria-hidden>{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-200">
          {api.error && <p className="border-b border-gray-200 px-6 py-3 text-sm text-red-600">{api.error}</p>}
          <div className="flex flex-wrap gap-3 border-b border-gray-200 px-6 py-3">
            <select aria-label="Company" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className={selectClass}>
              <option value="all">All companies</option>
              <option value="none">No company</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select aria-label="Job site" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className={selectClass}>
              <option value="all">All job sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select aria-label="Tag" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={selectClass}>
              <option value="all">All tags</option>
              {TAG_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {loading ? (
            <p className="p-6 text-sm text-gray-600">Loading...</p>
          ) : shown.length === 0 ? (
            <p className="p-6 text-sm text-gray-600">{rows.length === 0 ? "No invites sent yet." : "No invites match these filters."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Tag</th>
                    <th className="px-6 py-3 font-medium">Company</th>
                    <th className="px-6 py-3 font-medium">Job site</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Email status</th>
                    <th className="px-6 py-3 font-medium">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.key} className="border-b border-gray-200 last:border-0">
                      <td className="px-6 py-4 text-gray-950">{r.email}</td>
                      <td className="px-6 py-4">
                        <span className="flex flex-wrap gap-1">
                          {r.tags.map((t) => (
                            <RoleTagPill key={t} kind={t} />
                          ))}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{subName(r.companyId)}</td>
                      <td className="px-6 py-4 text-gray-600">{r.siteText}</td>
                      <td className="px-6 py-4">{r.statusCell}</td>
                      <td className="px-6 py-4">{r.emailCell}</td>
                      <td className="px-6 py-4 text-right">{r.actions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
