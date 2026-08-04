"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { JobSiteReport } from "@/lib/types";

export default function JobSiteReportTable({
  jobSiteReports,
  activeJobSiteCount,
}: {
  jobSiteReports: JobSiteReport[];
  activeJobSiteCount: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-950">Job Site Reports</h2>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-2">
          <p className="text-xs font-medium text-gray-600">Active job sites</p>
          <p className="text-lg font-semibold text-gray-950">{activeJobSiteCount}</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-950">Employees per job site</p>
        <div className="mt-3 h-56">
          {jobSiteReports.length === 0 ? (
            <p className="text-sm text-gray-600">
              No site-tagged clock events in this range.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jobSiteReports}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="siteName" tick={{ fontSize: 12 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="employeeCount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {jobSiteReports.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Job site</th>
                <th className="px-4 py-2 font-medium">Employees</th>
                <th className="px-4 py-2 font-medium">Avg hours</th>
                <th className="px-4 py-2 font-medium">On-time %</th>
              </tr>
            </thead>
            <tbody>
              {jobSiteReports.map((s) => (
                <tr key={s.siteId} className="border-b border-gray-200 last:border-0">
                  <td className="px-4 py-2.5 text-gray-950">{s.siteName}</td>
                  <td className="px-4 py-2.5 text-gray-600">{s.employeeCount}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-950">
                    {s.avgHours.toFixed(1)}h
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {s.onTimePercent.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
