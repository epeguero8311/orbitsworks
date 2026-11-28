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
import { useEmployeePins } from "@/lib/hooks/useEmployeePins";
import { AddEmployeeForm } from "@/components/dashboard/employees/AddEmployeeForm";
import { EmployeesTable } from "@/components/dashboard/employees/EmployeesTable";
import { EmployeeModal } from "@/components/dashboard/employees/EmployeeModal";
import { InvitesSection } from "@/components/dashboard/employees/InvitesSection";
import { InviteForm } from "@/components/dashboard/employees/InviteForm";
import type { Employee } from "@/lib/types";

// The Employees page (app/dashboard/employees/page.tsx renders only this,
// to keep page.tsx small). Phase 3B adds the App invites card (below the
// table), the row status pill and Invite to app in the Edit window - all
// from ONE useEmployeeInvites listener.
export function EmployeesPageView() {
  const { userData } = useAuth();
  const { employees: employeeDocs, loading, toggleEmployeeActive } = useEmployees({ includeKiosks: true });
  // PINs come from the server-only employeePins (admin callable), not the
  // employee doc - see useEmployeePins.
  const employees = useEmployeePins(employeeDocs, !loading);
  const { sites } = useSites();
  const { jobs } = useJobs();
  const { subcontractors } = useSubcontractors();
  const { settings, isPro, canUseInvites, loading: settingsLoading } = useCompanySettings();
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
      {/* Phase 9 (H1 a): one invite form with a role dropdown. */}
      <div className="mt-10">
        <InviteForm sites={activeSites} createAppInvite={appInvites.create} />
      </div>
      {/* Task 5 v2 (2): one merged, collapsible Invites section. */}
      <div className="mt-10">
        <InvitesSection api={appInvites} employees={employees} sites={activeSites} subcontractors={subcontractors} />
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
          isPro={isPro}
          allEmployees={employees}
          onOpenEmployee={setSelectedId}
        />
      )}
    </div>
  );
}
