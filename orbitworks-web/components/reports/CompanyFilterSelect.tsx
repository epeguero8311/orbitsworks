"use client";

import { ALL_COMPANIES, MAIN_COMPANY, type CompanyFilter } from "@/lib/reportCompanyFilter";
import type { Subcontractor } from "@/lib/types";

// Phase 9 (H9 a/a): one company filter for the whole Reports page and every
// export - by each employee's current company. Shown only when the company
// has subcontractors (otherwise there is nothing to pick).
export default function CompanyFilterSelect({
  value,
  onChange,
  subcontractors,
  mainCompanyName,
}: {
  value: CompanyFilter;
  onChange: (value: CompanyFilter) => void;
  subcontractors: Subcontractor[];
  mainCompanyName: string;
}) {
  if (subcontractors.length === 0) return null;
  return (
    <div>
      <label htmlFor="reportCompany" className="mb-1.5 block text-sm font-medium text-gray-950">Company</label>
      <select
        id="reportCompany"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      >
        <option value={ALL_COMPANIES}>All companies</option>
        <option value={MAIN_COMPANY}>{mainCompanyName} (in-house)</option>
        {subcontractors.map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (inactive)"}</option>
        ))}
      </select>
    </div>
  );
}
