"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Employee, JobSite, Job, Subcontractor } from "@/lib/types";
import { UpgradeToast } from "@/components/UpgradeToast";

export function EmployeesTable({
  employees,
  sites,
  jobs,
  subcontractors,
  companyName,
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
  jobs: Job[];
  subcontractors: Subcontractor[];
  companyName: string;
  loading: boolean;
  onSelect: (employee: Employee) => void;
  onToggleActive: (employeeId: string, active: boolean) => Promise<void>;
  employeeLimit?: number;
}) {
  const [showUpgradeToast, setShowUpgradeToast] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("");

  const filteredEmployees = useMemo(() => {
    if (!companyFilter) return employees;
    if (companyFilter === "__main__") {
      return employees.filter((e) => !e.subcontractorId);
    }
    return employees.filter((e) => e.subcontractorId === companyFilter);
  }, [employees, companyFilter]);

  const activeCount = filteredEmployees.filter((e) => e.active).length;

  // Active employees first, inactive ones pushed to the bottom. Array.sort
  // is stable in modern JS engines, so relative order within each group is
  // preserved -- this only moves rows between the two groups, it doesn't
  // reshuffle within a group.
  const sortedEmployees = useMemo(() => {
    return [...filteredEmployees].sort((a, b) => {
      if (a.active === b.active) return 0;
      return a.active ? -1 : 1;
    });
  }, [filteredEmployees]);

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

  function displayJobTitle(employee: Employee) {
    if (employee.jobId) {
      const job = jobs.find((j) => j.id === employee.jobId);
      return job?.name ?? employee.jobTitle ?? "-";
    }
    return employee.jobTitle || "-";
  }

  function displayRate(employee: Employee) {
    if (employee.jobId) {
      const job = jobs.find((j) => j.id === employee.jobId);
      return job ? `$${job.hourlyRate.toFixed(2)}/hr` : "-";
    }
    return employee.hourlyRate ? `$${employee.hourlyRate.toFixed(2)}/hr` : "-";
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-950">
          All employees
          {!loading && (
            <span className="ml-2 font-normal text-gray-600">
              ({filteredEmployees.length})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-4">
          {subcontractors.length > 0 && (
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">All companies</option>
              <option value="__main__">{companyName}</option>
              {subcontractors.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          )}
          {!loading && employees.length > 0 && (
            <span className="text-sm font-medium text-gray-600">
              Active: {activeCount}
              {employeeLimit != null ? ` / ${employeeLimit}` : ""}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <p className="p-6 text-sm text-gray-600">Loading...</p>
      ) : employees.length === 0 ? (
        <p className="p-6 text-sm text-gray-600">
          No employees yet. Add one above to get started.
        </p>
      ) : sortedEmployees.length === 0 ? (
        <p className="p-6 text-sm text-gray-600">
          No employees match this filter.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-600">
            <tr>
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Job title</th>
              <th className="px-6 py-3 font-medium">Rate</th>
              <th className="px-6 py-3 font-medium">Job sites</th>
              <th className="px-6 py-3 font-medium">Company</th>
              <th className="px-6 py-3 font-medium">PIN</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium"></th>
            </tr>
          </thead>
          <motion.tbody layout>
            <AnimatePresence initial={false}>
              {sortedEmployees.map((employee) => (
                <motion.tr
                  key={employee.id}
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  onClick={() => onSelect(employee)}
                  className="cursor-pointer border-b border-gray-200 bg-white transition-colors last:border-0 hover:bg-gray-50"
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
                    {displayJobTitle(employee)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {displayRate(employee)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {siteNames(employee.assignedSiteIds)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {employee.subcontractorId ? (
                      <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                        {employee.subcontractorName ?? "Subcontractor"}
                      </span>
                    ) : (
                      companyName
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-gray-950">
                    {employee.pin ?? "-"}
                  </td>
                  <td className="px-6 py-4">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={employee.active ? "active" : "inactive"}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.15 }}
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          employee.active
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {employee.active ? "Active" : "Inactive"}
                      </motion.span>
                    </AnimatePresence>
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
                </motion.tr>
              ))}
            </AnimatePresence>
          </motion.tbody>
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