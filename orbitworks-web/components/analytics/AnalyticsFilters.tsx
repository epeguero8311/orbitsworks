"use client";

import type { DateRangePreset } from "@/lib/validators/dateRange";
import type { WorkerFilter, SiteOption } from "@/lib/hooks/useSiteCosts";

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "thisWeek", label: "This week" },
  { value: "lastWeek", label: "Last week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "custom", label: "Custom" },
];

export default function AnalyticsFilters({
  preset,
  onPresetChange,
  startDate,
  endDate,
  onCustomDateChange,
  onApplyCustomRange,
  siteFilter,
  onSiteFilterChange,
  sites,
  workerFilter,
  onWorkerFilterChange,
  loading,
}: {
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
  startDate: string;
  endDate: string;
  onCustomDateChange: (field: "start" | "end", value: string) => void;
  onApplyCustomRange: () => void;
  siteFilter: string | null;
  onSiteFilterChange: (value: string | null) => void;
  sites: SiteOption[];
  workerFilter: WorkerFilter;
  onWorkerFilterChange: (value: WorkerFilter) => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-950">Date range</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => onPresetChange(p.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                preset === p.value
                  ? "bg-accent text-white"
                  : "border border-gray-200 text-gray-950 hover:border-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="analyticsStart" className="mb-1.5 block text-xs font-medium text-gray-950">
              Start date
            </label>
            <input
              id="analyticsStart"
              type="date"
              value={startDate}
              onChange={(e) => onCustomDateChange("start", e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="analyticsEnd" className="mb-1.5 block text-xs font-medium text-gray-950">
              End date
            </label>
            <input
              id="analyticsEnd"
              type="date"
              value={endDate}
              onChange={(e) => onCustomDateChange("end", e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <button
            onClick={onApplyCustomRange}
            disabled={loading}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {loading ? "Calculating..." : "Apply"}
          </button>
        </div>
      )}

      <div>
        <label htmlFor="analyticsSite" className="mb-1.5 block text-xs font-medium text-gray-950">
          Site
        </label>
        <select
          id="analyticsSite"
          value={siteFilter ?? ""}
          onChange={(e) => onSiteFilterChange(e.target.value || null)}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="analyticsWorker" className="mb-1.5 block text-xs font-medium text-gray-950">
          Workers
        </label>
        <select
          id="analyticsWorker"
          value={workerFilter}
          onChange={(e) => onWorkerFilterChange(e.target.value as WorkerFilter)}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="all">All</option>
          <option value="inHouse">In-house only</option>
          <option value="subs">Subs only</option>
        </select>
      </div>
    </div>
  );
}
