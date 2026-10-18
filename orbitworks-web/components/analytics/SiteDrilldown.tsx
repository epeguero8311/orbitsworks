"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { EmployeeSiteCost, SiteCostReport, SiteWeeklyCostPoint } from "@/lib/types";

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function SiteDrilldown({
  site,
  employeeSiteCosts,
  weeklyTrend,
  onClose,
}: {
  site: SiteCostReport;
  employeeSiteCosts: EmployeeSiteCost[];
  weeklyTrend: SiteWeeklyCostPoint[];
  onClose: () => void;
}) {
  const employees = employeeSiteCosts
    .filter((e) => e.siteId === site.siteId)
    .sort((a, b) => b.cost - a.cost);

  const trend = weeklyTrend.map((w) => ({
    weekLabel: w.weekLabel,
    cost: w.costBySite[site.siteId] ?? 0,
  }));

  const splitTotal = site.inHouseCost + site.subCost;
  const inHousePct = splitTotal > 0 ? (site.inHouseCost / splitTotal) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-950">{site.siteName}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {formatCurrency(site.cost)} total - {site.hours.toFixed(1)}h - {site.headcount} employees
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-950"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-950">In-house vs subcontractor</p>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-accent" style={{ width: `${inHousePct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-gray-600">
            <span>In-house: {formatCurrency(site.inHouseCost)}</span>
            <span>Subcontractor: {formatCurrency(site.subCost)}</span>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-gray-950">Weekly cost trend</p>
          <div className="mt-3 h-48">
            {trend.length === 0 ? (
              <p className="text-sm text-gray-600">No data in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 12 }} stroke="#6b7280" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Cost"]} />
                  <Line type="monotone" dataKey="cost" stroke="#3b6fe0" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-gray-950">Employees at this site</p>
          {employees.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No employees in this range.</p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Hours</th>
                    <th className="px-4 py-2 font-medium">OT hours</th>
                    <th className="px-4 py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.employeeId} className="border-b border-gray-200 last:border-0">
                      <td className="px-4 py-2.5 text-gray-950">
                        {e.employeeName}
                        {e.isLive && (
                          <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                            live
                          </span>
                        )}
                        {e.missingRate && (
                          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            no rate
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-gray-950">{e.hours.toFixed(1)}h</td>
                      <td className="px-4 py-2.5 font-mono text-gray-600">{e.otHours.toFixed(1)}h</td>
                      <td className="px-4 py-2.5 font-mono text-gray-950">{formatCurrency(e.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
