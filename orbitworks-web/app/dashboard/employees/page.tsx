"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { useSites } from "@/lib/hooks/useSites";
import { useJobs } from "@/lib/hooks/useJobs";
import { AddEmployeeForm } from "@/components/dashboard/employees/AddEmployeeForm";
import { EmployeesTable } from "@/components/dashboard/employees/EmployeesTable";
import { EmployeeModal } from "@/components/dashboard/employees/EmployeeModal";
import { SupervisorInvites } from "@/components/dashboard/employees/SupervisorInvites";
import type { Employee } from "@/lib/types";

export default function EmployeesPage() {
  const { userData } = useAuth();
  const { employees, loading, toggleEmployeeActive } = useEmployees();
  const { sites } = useSites();
  const { jobs } = useJobs();
  const activeSites = sites.filter((s) => s.active);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const employeeForModal = selectedEmployee
    ? employees.find((e) => e.id === selectedEmployee.id) ?? selectedEmployee
    : null;
  const employeeLimit: number | undefined = undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-950">Employees</h1>
      <p className="mt-1.5 text-sm text-gray-600">
        Add employees, assign job sites, and upload a reference photo for
        face matching.
      </p>

      <div className="mt-8">
        <AddEmployeeForm sites={activeSites} jobs={jobs} />
      </div>

      <div className="mt-6">
        <EmployeesTable
          employees={employees}
          sites={activeSites}
          jobs={jobs}
          loading={loading}
          onSelect={setSelectedEmployee}
          onToggleActive={toggleEmployeeActive}
          employeeLimit={employeeLimit}
        />
      </div>

      <div className="mt-10">
        <SupervisorInvites sites={activeSites} />
      </div>

      {employeeForModal && (
        <EmployeeModal
          employee={employeeForModal}
          sites={activeSites}
          jobs={jobs}
          companyId={userData?.companyId ?? ""}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}