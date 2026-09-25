"use client";

import { DollarSign, Clock, TrendingUp, Building2 } from "lucide-react";
import StatCard from "@/components/dashboard/overview/StatCard";
import type { AnalyticsSummary } from "@/lib/types";
import type { AnalyticsComparison } from "@/lib/hooks/useSiteCosts";

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function AnalyticsStatCards({
  summary,
  comparison,
  loading,
  periodLabel,
}: {
  summary: AnalyticsSummary | null;
  comparison: AnalyticsComparison | null;
  loading: boolean;
  periodLabel: string;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={DollarSign}
        iconBg="bg-green-50"
        iconColor="text-green-600"
        label="Total labor cost"
        value={summary ? formatCurrency(summary.totalLaborCost) : "-"}
        loading={loading}
        changePercent={comparison?.totalLaborCostChangePercent}
        changeLabel={periodLabel}
      />
      <StatCard
        icon={Clock}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        label="Total hours"
        value={summary ? `${summary.totalHours.toFixed(1)}h` : "-"}
        loading={loading}
        changePercent={comparison?.totalHoursChangePercent}
        changeLabel={periodLabel}
      />
      <StatCard
        icon={TrendingUp}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        label="OT cost"
        value={summary ? formatCurrency(summary.totalOtCost) : "-"}
        loading={loading}
        changePercent={comparison?.totalOtCostChangePercent}
        changeLabel={periodLabel}
      />
      <StatCard
        icon={Building2}
        iconBg="bg-purple-50"
        iconColor="text-purple-600"
        label="Most expensive site"
        value={
          summary?.mostExpensiveSite
            ? `${summary.mostExpensiveSite.siteName} - ${formatCurrency(summary.mostExpensiveSite.cost)}`
            : "-"
        }
        loading={loading}
        changePercent={comparison?.mostExpensiveSiteChangePercent}
        changeLabel={periodLabel}
      />
    </div>
  );
}
