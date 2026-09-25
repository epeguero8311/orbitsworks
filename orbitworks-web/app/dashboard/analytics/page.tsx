"use client";

import { useState } from "react";
import { useAnalyticsPage } from "@/lib/hooks/useAnalyticsPage";
import { previousPeriodLabel } from "@/lib/validators/dateRange";
import AnalyticsLockedUpsell from "@/components/analytics/AnalyticsLockedUpsell";
import AnalyticsFilters from "@/components/analytics/AnalyticsFilters";
import AnalyticsResults from "@/components/analytics/AnalyticsResults";
import SiteDrilldown from "@/components/analytics/SiteDrilldown";

export default function AnalyticsPage() {
  const a = useAnalyticsPage();
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  if (a.planLoading) return <p className="text-sm text-gray-600">Loading...</p>;
  if (!a.isPro) return <AnalyticsLockedUpsell />;

  const selectedSite = a.summary?.siteReports.find((s) => s.siteId === selectedSiteId) ?? null;

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Analytics</h1>
      <p className="mt-1 text-sm text-gray-600">Where your labor money is going.</p>
      <div className="mt-6">
        <AnalyticsFilters
          preset={a.preset}
          onPresetChange={a.handlePresetChange}
          startDate={a.startDate}
          endDate={a.endDate}
          onCustomDateChange={a.handleCustomDateChange}
          onApplyCustomRange={a.handleApplyCustomRange}
          siteFilter={a.siteFilter}
          onSiteFilterChange={a.handleSiteFilterChange}
          sites={a.sites}
          workerFilter={a.workerFilter}
          onWorkerFilterChange={a.handleWorkerFilterChange}
          loading={a.loading}
        />
      </div>
      {a.error && <p className="mt-4 text-sm text-red-600">{a.error}</p>}
      {a.summary && (
        <AnalyticsResults
          summary={a.summary}
          comparison={a.comparison}
          loading={a.loading}
          periodLabel={previousPeriodLabel(a.preset)}
          siteFilter={a.siteFilter}
          onSelectSite={setSelectedSiteId}
        />
      )}
      {selectedSite && a.summary && (
        <SiteDrilldown
          site={selectedSite}
          employeeSiteCosts={a.summary.employeeSiteCosts}
          weeklyTrend={a.summary.weeklyTrend}
          onClose={() => setSelectedSiteId(null)}
        />
      )}
    </div>
  );
}
