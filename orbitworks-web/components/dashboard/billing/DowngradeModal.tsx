"use client";

import { useState } from "react";

type EmployeeLite = {
  id: string;
  name: string;
  isSupervisor?: boolean;
};

export default function DowngradeModal({
  requiredCount,
  employees,
  onCancel,
  onConfirm,
  isSubmitting,
}: {
  requiredCount: number;
  employees: EmployeeLite[];
  onCancel: () => void;
  onConfirm: (selectedIds: string[]) => void;
  isSubmitting: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < requiredCount) {
        next.add(id);
      }
      return next;
    });
  }

  const canConfirm = selected.size === requiredCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-base font-semibold text-gray-950">
          Choose employees to deactivate
        </h2>
        <p className="mt-1.5 text-sm text-gray-600">
          This plan supports fewer employees than you currently have active.
          Select exactly {requiredCount} employee{requiredCount === 1 ? "" : "s"} to
          deactivate before continuing. You can reactivate anyone later from
          the Employees page.
        </p>

        <div className="mt-4 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
          {employees.map((emp) => (
            <label
              key={emp.id}
              className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.has(emp.id)}
                onChange={() => toggle(emp.id)}
                disabled={!selected.has(emp.id) && selected.size >= requiredCount}
                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
              />
              <span className="text-gray-950">{emp.name}</span>
              {emp.isSupervisor && (
                <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  Supervisor
                </span>
              )}
            </label>
          ))}
        </div>

        <p className="mt-2 text-xs text-gray-600">
          {selected.size} of {requiredCount} selected
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-950 hover:border-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm || isSubmitting}
            onClick={() => onConfirm(Array.from(selected))}
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Updating..." : "Deactivate & continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
