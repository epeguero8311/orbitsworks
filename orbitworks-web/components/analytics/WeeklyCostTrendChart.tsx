"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { SiteCostReport, SiteWeeklyCostPoint } from "@/lib/types";

const LINE_COLORS = ["#3b6fe0", "#8b5cf6", "#059669", "#d97706", "#dc2626", "#0891b2"];

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function WeeklyCostTrendChart({
  weeklyTrend,
  siteReports,
  siteFilter,
}: {
  weeklyTrend: SiteWeeklyCostPoint[];
  siteReports: SiteCostReport[];
  siteFilter: string | null;
}) {
  const chartData = weeklyTrend.map((w) => ({
    weekLabel: w.weekLabel,
    total: w.totalCost,
    ...w.costBySite,
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-950">Weekly cost trend</p>
      <div className="mt-3 h-64">
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-600">No data in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 12 }} stroke="#6b7280" />
              <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip formatter={(value) => [formatCurrency(Number(value)), ""]} />
              {siteFilter || siteReports.length === 0 ? (
                <Line type="monotone" dataKey="total" name="Total" stroke="#3b6fe0" strokeWidth={2} dot={{ r: 3 }} />
              ) : (
                <>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {siteReports.map((s, i) => (
                    <Line
                      key={s.siteId}
                      type="monotone"
                      dataKey={s.siteId}
                      name={s.siteName}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
