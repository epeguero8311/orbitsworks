"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { SiteCostReport } from "@/lib/types";

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function InHouseVsSubChart({ siteReports }: { siteReports: SiteCostReport[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-950">In-house vs subcontractor cost</p>
      <div className="mt-3 h-64">
        {siteReports.length === 0 ? (
          <p className="text-sm text-gray-600">No data in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={siteReports}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="siteName" tick={{ fontSize: 12 }} stroke="#6b7280" />
              <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip formatter={(value) => [formatCurrency(Number(value)), ""]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="inHouseCost" name="In-house" stackId="cost" fill="#3b6fe0" radius={[0, 0, 0, 0]} />
              <Bar dataKey="subCost" name="Subcontractor" stackId="cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
