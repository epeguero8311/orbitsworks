"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { SiteCostReport } from "@/lib/types";

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

type SortKey = keyof Pick<
  SiteCostReport,
  "siteName" | "hours" | "cost" | "otHours" | "otCost" | "avgHourlyRate" | "headcount"
>;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "siteName", label: "Site" },
  { key: "hours", label: "Hours" },
  { key: "cost", label: "Labor cost" },
  { key: "otHours", label: "OT hours" },
  { key: "otCost", label: "OT cost" },
  { key: "avgHourlyRate", label: "Avg $/hr" },
  { key: "headcount", label: "Headcount" },
];

export default function SiteTable({
  siteReports,
  onSelectSite,
}: {
  siteReports: SiteCostReport[];
  onSelectSite: (siteId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(() => {
    const rows = [...siteReports];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "string" || typeof bv === "string"
          ? String(av ?? "").localeCompare(String(bv ?? ""))
          : (av ?? 0) - (bv ?? 0);
      return sortDesc ? -cmp : cmp;
    });
    return rows;
  }, [siteReports, sortKey, sortDesc]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  if (siteReports.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-600">No site-tagged clock events in this range.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-gray-600">
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-2 font-medium">
                <button
                  onClick={() => handleSort(col.key)}
                  className="flex items-center gap-1 hover:text-gray-950"
                >
                  {col.label}
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.siteId}
              onClick={() => onSelectSite(s.siteId)}
              className="cursor-pointer border-b border-gray-200 last:border-0 hover:bg-gray-50"
            >
              <td className="px-4 py-2.5 font-medium text-gray-950">{s.siteName}</td>
              <td className="px-4 py-2.5 font-mono text-gray-950">{s.hours.toFixed(1)}h</td>
              <td className="px-4 py-2.5 font-mono text-gray-950">{formatCurrency(s.cost)}</td>
              <td className="px-4 py-2.5 font-mono text-gray-600">{s.otHours.toFixed(1)}h</td>
              <td className="px-4 py-2.5 font-mono text-gray-600">{formatCurrency(s.otCost)}</td>
              <td className="px-4 py-2.5 font-mono text-gray-600">
                {s.avgHourlyRate != null ? `$${s.avgHourlyRate.toFixed(2)}` : "-"}
              </td>
              <td className="px-4 py-2.5 text-gray-600">{s.headcount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
