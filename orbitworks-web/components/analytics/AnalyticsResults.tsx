"use client";

import type { AnalyticsSummary } from "@/lib/types";
import type { AnalyticsComparison } from "@/lib/hooks/useSiteCosts";
import AnalyticsStatCards from "@/components/analytics/AnalyticsStatCards";
import AnalyticsNotes from "@/components/analytics/AnalyticsNotes";
import CostPerSiteChart from "@/components/analytics/CostPerSiteChart";
import InHouseVsSubChart from "@/components/analytics/InHouseVsSubChart";
import WeeklyCostTrendChart from "@/components/analytics/WeeklyCostTrendChart";
import SiteTable from "@/components/analytics/SiteTable";

export default function AnalyticsResults({
  summary,
  comparison,
  loading,
  periodLabel,
  siteFilter,
  onSelectSite,
}: {
  summary: AnalyticsSummary;
  comparison: AnalyticsComparison | null;
  loading: boolean;
  periodLabel: string;
  siteFilter: string | null;
  onSelectSite: (siteId: string) => void;
}) {
  return (
    <div className="mt-6 space-y-8">
      <AnalyticsStatCards
        summary={summary}
        comparison={comparison}
        loading={loading}
        periodLabel={periodLabel}
      />
      <AnalyticsNotes summary={summary} />

      {summary.siteReports.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          No site-tagged clock events in this range.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <CostPerSiteChart siteReports={summary.siteReports} />
            <InHouseVsSubChart siteReports={summary.siteReports} />
          </div>
          <WeeklyCostTrendChart
            weeklyTrend={summary.weeklyTrend}
            siteReports={summary.siteReports}
            siteFilter={siteFilter}
          />
          <SiteTable siteReports={summary.siteReports} onSelectSite={onSelectSite} />
        </>
      )}
    </div>
  );
}
