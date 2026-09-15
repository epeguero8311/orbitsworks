"use client";

import type { Subcontractor } from "@/lib/types";

export function EmployeeCompanyField({
  employeeName,
  companyName,
  selectableSubcontractors,
  selectedCompanyValue,
  onCompanySelect,
  pendingCompanyChange,
  currentCompanyLabel,
  pendingSubcontractorName,
  companyReason,
  onCompanyReasonChange,
  companyError,
  companySubmitting,
  onConfirm,
  onCancel,
}: {
  employeeName: string;
  companyName: string;
  selectableSubcontractors: Subcontractor[];
  selectedCompanyValue: string;
  onCompanySelect: (value: string) => void;
  pendingCompanyChange: boolean;
  currentCompanyLabel: string;
  pendingSubcontractorName: string;
  companyReason: string;
  onCompanyReasonChange: (value: string) => void;
  companyError: string | null;
  companySubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5">
      <span className="mb-2 block text-sm font-medium text-gray-950">
        Company
      </span>
      <p className="mb-2 text-xs text-gray-600">
        Which company {employeeName} currently works under. Past clock
        events stay attributed to whichever company was in effect when
        they were recorded - this only changes new events going
        forward.
      </p>
      <select
        value={selectedCompanyValue}
        onChange={(e) => onCompanySelect(e.target.value)}
        className="w-full max-w-xs rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      >
        <option value="">{companyName}</option>
        {selectableSubcontractors.map((sub) => (
          <option key={sub.id} value={sub.id}>
            {sub.name}
          </option>
        ))}
      </select>

      {pendingCompanyChange && (
        <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-gray-950">
            Move {employeeName} from{" "}
            <span className="font-semibold">{currentCompanyLabel}</span>{" "}
            to{" "}
            <span className="font-semibold">
              {pendingSubcontractorName}
            </span>
            ?
          </p>
          <input
            type="text"
            value={companyReason}
            onChange={(e) => onCompanyReasonChange(e.target.value)}
            placeholder="Reason (optional)"
            className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          {companyError && (
            <p className="mt-2 text-xs text-red-600">{companyError}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={companySubmitting}
              onClick={onConfirm}
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {companySubmitting ? "Moving..." : "Confirm"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
