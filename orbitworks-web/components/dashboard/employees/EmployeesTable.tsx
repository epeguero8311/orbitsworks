"use client";

import { useState } from "react";
import type { Employee, JobSite } from "@/lib/types";
import { UpgradeToast } from "@/components/UpgradeToast";

export function EmployeesTable({
  employees,
  sites,
  loading,
  onSelect,
  onToggleActive,
  // TODO: wire this to the real per-tier employee cap once we know where
  // it lives (company doc field vs. a tiers config keyed by planTier).
  // Leaving it undefined suppresses the "/ max" suffix so nothing breaks
  // in the meantime.
  employeeLimit,
}: {
  employees: Employee[];
  sites: JobSite[];
  loading: boolean;
  onSelect: (employee: Employee) => void;
  onToggleActive: (employeeId: string, active: boolean) => Promise<void>;
  employeeLimit?: number;
}) {
  const [showUpgradeToast, setShowUpgradeToast] = useState(false);

  const activeCount = employees.filter((e) => e.active).length;

  async function toggleActive(employee: Employee) {
    try {
      await onToggleActive(employee.id, !employee.active);
    } catch (err: any) {
      console.error("Toggle employee active error:", err);
      if (err?.code === "functions/resource-exhausted") {
        setShowUpgradeToast(true);
      }
    }
  }

  function siteNames(ids: string[]) {
    if (ids.length === 0) return "-";
    return ids
      .map((id) => sites.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-950">
          All employees
          {!loading && (
            <span className="ml-2 font-normal text-gray-600">
              ({employees.length})
            </span>
          )}
        </h2>
        {!loading && employees.length > 0 && (
          <span className="text-sm font-medium text-gray-600">
            Active: {activeCount}
            {employeeLimit != null ? ` / ${employeeLimit}` : ""}
          </span>
        )}
      </div>

      {loading ? (
        <p className="p-6 text-sm text-gray-600">Loading...</p>
      ) : employees.length === 0 ? (
        <p className="p-6 text-sm text-gray-600">
          No employees yet. Add one above to get started.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-600">
            <tr>
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Job title</th>
              <th className="px-6 py-3 font-medium">Rate</th>
              <th className="px-6 py-3 font-medium">Job sites</th>
              <th className="px-6 py-3 font-medium">PIN</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr
                key={employee.id}
                onClick={() => onSelect(employee)}
                className="cursor-pointer border-b border-gray-200 transition-colors last:border-0 hover:bg-gray-50"
              >
                <td className="px-6 py-4 font-medium text-gray-950">
                  <span className="flex items-center gap-2">
                    {employee.photoUrl ? (
                      <img
                        src={employee.photoUrl}
                        alt={employee.name}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : null}
                    {employee.name}
                    {employee.isSupervisor && (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        Supervisor
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {employee.jobTitle || "-"}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {employee.hourlyRate ? `$${employee.hourlyRate.toFixed(2)}/hr` : "-"}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {siteNames(employee.assignedSiteIds)}
                </td>
                <td className="px-6 py-4 font-mono text-gray-950">
                  {employee.pin ?? "-"}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      employee.active
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {employee.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActive(employee);
                    }}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {employee.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <UpgradeToast
        visible={showUpgradeToast}
        onClose={() => setShowUpgradeToast(false)}
        message="You've reached your employee limit."
      />
    </div>
  );
}