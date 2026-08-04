"use client";

import type { EmployeeSummary } from "@/lib/types";
import { formatHours } from "@/lib/reportUtils";

export default function PayrollTable({
  summaries,
  startDate,
  endDate,
}: {
  summaries: EmployeeSummary[];
  startDate: string;
  endDate: string;
}) {
  const totalHoursAll = summaries.reduce((sum, s) => sum + s.totalHours, 0);
  const totalOpenSessions = summaries.reduce((sum, s) => sum + s.openSessions, 0);
  const totalEstimatedPay = summaries.reduce((sum, s) => sum + (s.estimatedPay ?? 0), 0);
  const anyRatesMissing = summaries.some((s) => s.hourlyRate == null);

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-950">Payroll</h2>

      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-600">
            Total hours ({startDate} to {endDate})
          </p>
          <p className="mt-1 text-2xl font-semibold text-gray-950">
            {formatHours(totalHoursAll)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-600">Estimated payroll</p>
          <p className="mt-1 text-2xl font-semibold text-gray-950">
            ${totalEstimatedPay.toFixed(2)}
          </p>
          {anyRatesMissing && (
            <p className="mt-1 text-xs text-amber-600">
              Some employees are missing an hourly rate.
            </p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-600">Missing clock-outs</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              totalOpenSessions > 0 ? "text-amber-600" : "text-gray-950"
            }`}
          >
            {totalOpenSessions}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {summaries.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">No clock events in this date range.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Total hours</th>
                <th className="px-4 py-2 font-medium">Sessions</th>
                <th className="px-4 py-2 font-medium">Missing clock-out</th>
                <th className="px-4 py-2 font-medium">Est. pay</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.employeeId} className="border-b border-gray-200 last:border-0">
                  <td className="px-4 py-2.5 text-gray-950">{s.employeeName}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-950">
                    {formatHours(s.totalHours)}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{s.sessionCount}</td>
                  <td className="px-4 py-2.5">
                    {s.openSessions > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {s.openSessions} open
                      </span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-gray-950">
                    {s.estimatedPay != null ? `$${s.estimatedPay.toFixed(2)}` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
