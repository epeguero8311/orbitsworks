"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { useSites } from "@/lib/hooks/useSites";
import { AddEmployeeForm } from "@/components/dashboard/employees/AddEmployeeForm";
import { EmployeesTable } from "@/components/dashboard/employees/EmployeesTable";
import { EmployeeModal } from "@/components/dashboard/employees/EmployeeModal";
import { SupervisorInvites } from "@/components/dashboard/employees/SupervisorInvites";
import type { Employee } from "@/lib/types";

export default function EmployeesPage() {
  const { userData } = useAuth();
  const { employees, loading } = useEmployees();
  const { sites } = useSites();
  const activeSites = sites.filter((s) => s.active);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const employeeForModal = selectedEmployee
    ? employees.find((e) => e.id === selectedEmployee.id) ?? selectedEmployee
    : null;

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Employees</h1>
      <p className="mt-1 text-sm text-gray-600">
        Add employees, assign job sites, and upload a reference photo for
        face matching.
      </p>

      <AddEmployeeForm sites={activeSites} />

      <div className="mt-6">
        <EmployeesTable
          employees={employees}
          sites={activeSites}
          loading={loading}
          onSelect={setSelectedEmployee}
        />
      </div>

      <SupervisorInvites sites={activeSites} />

      {employeeForModal && (
        <EmployeeModal
          employee={employeeForModal}
          sites={activeSites}
          companyId={userData?.companyId ?? ""}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}