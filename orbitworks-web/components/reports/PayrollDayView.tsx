"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EmployeeSummary, Job, RoundingIncrement } from "@/lib/types";
import { dateKey } from "@/lib/reportUtils";
import { minutesToHoursDecimal } from "@/lib/utils/rounding";
import { buildDailyBreakdownRows } from "@/lib/reportDailyBreakdown";

export default function PayrollDayView({
  startDate,
  endDate,
  summaries,
  jobs,
  hoursByEmployeeDay,
  breakHoursByEmployeeDay,
  roundDailyMinutes,
  overrides,
  onOverrideChange,
}: {
  startDate: string;
  endDate: string;
  summaries: EmployeeSummary[];
  jobs: Job[];
  hoursByEmployeeDay: Map<string, number>;
  breakHoursByEmployeeDay: Map<string, number>;
  roundDailyMinutes: RoundingIncrement;
  overrides: Record<string, string>;
  onOverrideChange: (employeeId: string, date: string, jobId: string) => void;
}) {
  const [currentDate, setCurrentDate] = useState(startDate);

  useEffect(() => {
    setCurrentDate(startDate);
  }, [startDate, endDate]);

  function shiftDate(deltaDays: number) {
    const d = new Date(currentDate + "T00:00:00");
    d.setDate(d.getDate() + deltaDays);
    const next = dateKey(d);
    if (next < startDate || next > endDate) return;
    setCurrentDate(next);
  }

  const dateLabel = new Date(currentDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const allRows = buildDailyBreakdownRows(
    summaries,
    hoursByEmployeeDay,
    breakHoursByEmployeeDay,
    jobs,
    overrides,
    roundDailyMinutes
  );
  const rows = allRows.filter((r) => r.date === currentDate);

  const canGoBack = currentDate > startDate;
  const canGoForward = currentDate < endDate;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-950">Daily breakdown</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftDate(-1)}
            disabled={!canGoBack}
            className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-40 text-center text-sm font-medium text-gray-950">
            {dateLabel}
          </span>
          <button
            onClick={() => shiftDate(1)}
            disabled={!canGoForward}
            className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Change the job for a single day to recalculate that day's pay. This
        only affects this report - it doesn't change the employee's assigned job.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">No clock events on this day.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Job / hourly rate</th>
                <th className="px-4 py-2 font-medium">Hours</th>
                <th className="px-4 py-2 font-medium">Break</th>
                <th className="px-4 py-2 font-medium">Worked Hours</th>
                <th className="px-4 py-2 font-medium">Est. pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const defaultRate = summaries.find((s) => s.employeeId === r.employeeId)
                  ?.hourlyRate;
                return (
                <tr key={r.key} className="border-b border-gray-200 last:border-0">
                  <td className="px-4 py-2.5 text-gray-950">{r.employeeName}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={r.overrideJobId}
                      onChange={(e) =>
                        onOverrideChange(r.employeeId, currentDate, e.target.value)
                      }
                      className="rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                    >
                      <option value="">
                        Default{defaultRate != null ? ` - $${defaultRate.toFixed(2)}/hr` : ""}
                      </option>
                      {jobs
                        .filter((j) => j.active)
                        .map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.name} - ${j.hourlyRate.toFixed(2)}/hr
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-gray-950">
                    {minutesToHoursDecimal(r.clockedMinutes)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-gray-950">
                    {minutesToHoursDecimal(r.breakMinutes)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-gray-950">
                    {minutesToHoursDecimal(r.workedMinutes)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-gray-950">
                    {r.pay != null ? `$${r.pay.toFixed(2)}` : "-"}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
