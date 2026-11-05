"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { useSites } from "@/lib/hooks/useSites";
import { useJobs } from "@/lib/hooks/useJobs";
import { useSubcontractors } from "@/lib/hooks/useSubcontractors";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { useEmployeeInvites } from "@/lib/hooks/useEmployeeInvites";
import { AddEmployeeForm } from "@/components/dashboard/employees/AddEmployeeForm";
import { EmployeesTable } from "@/components/dashboard/employees/EmployeesTable";
import { EmployeeModal } from "@/components/dashboard/employees/EmployeeModal";
import { InviteManager } from "@/components/dashboard/employees/InviteManager";
import { AppInvitesCard } from "@/components/dashboard/employees/AppInvitesCard";
import { InviteForm } from "@/components/dashboard/employees/InviteForm";
import type { Employee } from "@/lib/types";

// The Employees page (app/dashboard/employees/page.tsx renders only this,
// to keep page.tsx small). Phase 3B adds the App invites card (below the
// table), the row status pill and Invite to app in the Edit window - all
// from ONE useEmployeeInvites listener.
export function EmployeesPageView() {
  const { userData } = useAuth();
  const { employees, loading, toggleEmployeeActive } = useEmployees();
  const { sites } = useSites();
  const { jobs } = useJobs();
  const { subcontractors } = useSubcontractors();
  const { settings, canUseInvites, loading: settingsLoading } = useCompanySettings();
  const appInvites = useEmployeeInvites();
  const companyName = settings.name || "Main company";
  const activeSites = sites.filter((s) => s.active);
  const employeeLimit: number | undefined = undefined;
  // null while the plan loads, so neither the invite form nor the plan note flashes.
  const invitePlanOk = settingsLoading ? null : canUseInvites;

  // Deep link from the faceBadReference alert card ("Update photo") -
  // ?openEmployee={id} opens that employee's edit modal once the list has
  // loaded, and the param is cleared so a refresh/back-nav doesn't keep
  // reopening it. The modal is tracked by id (live from the list), and a
  // new param seeds it during render - no setState inside an effect.
  const searchParams = useSearchParams();
  const router = useRouter();
  const openEmployeeId = searchParams.get("openEmployee");
  const [selectedId, setSelectedId] = useState<string | null>(openEmployeeId);
  const [seenParam, setSeenParam] = useState<string | null>(openEmployeeId);
  if (openEmployeeId !== seenParam) {
    setSeenParam(openEmployeeId);
    if (openEmployeeId) setSelectedId(openEmployeeId);
  }
  useEffect(() => {
    if (openEmployeeId && !loading) router.replace("/dashboard/employees");
  }, [openEmployeeId, loading, router]);
  const employeeForModal = selectedId ? employees.find((e) => e.id === selectedId) ?? null : null;
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-950">Employees</h1>
      <p className="mt-1.5 text-sm text-gray-600">
        Add employees, assign job sites, and upload a reference photo for
        face matching.
      </p>
      <div className="mt-8">
        <AddEmployeeForm sites={activeSites} jobs={jobs} subcontractors={subcontractors} companyName={companyName} />
      </div>
      <div className="mt-6">
        <EmployeesTable
          employees={employees}
          sites={activeSites}
          jobs={jobs}
          subcontractors={subcontractors}
          companyName={companyName}
          loading={loading}
          onSelect={(employee: Employee) => setSelectedId(employee.id)}
          onToggleActive={toggleEmployeeActive}
          employeeLimit={employeeLimit}
          invitesByEmployee={appInvites.byEmployee}
        />
      </div>
      {/* Phase 9 (H1 a): one invite form with a role dropdown; the three
          invite lists (App invites, Supervisors, Admins) stay below. */}
      <div className="mt-10">
        <InviteForm sites={activeSites} createAppInvite={appInvites.create} />
      </div>
      <div className="mt-10">
        <AppInvitesCard sites={activeSites} api={appInvites} />
      </div>
      <div className="mt-10">
        <InviteManager role="supervisor" sites={activeSites} />
      </div>
      <div className="mt-10">
        <InviteManager role="admin" />
      </div>
      {employeeForModal && (
        <EmployeeModal
          employee={employeeForModal}
          sites={activeSites}
          jobs={jobs}
          subcontractors={subcontractors}
          companyName={companyName}
          companyId={userData?.companyId ?? ""}
          onClose={() => setSelectedId(null)}
          appInvite={appInvites.byEmployee.get(employeeForModal.id)}
          appInviteApi={appInvites}
          appInvitePlanOk={invitePlanOk}
          allEmployees={employees}
          onOpenEmployee={setSelectedId}
        />
      )}
    </div>
  );
}
