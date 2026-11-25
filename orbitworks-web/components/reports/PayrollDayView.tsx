"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EmployeeSummary, Job, RoundingIncrement } from "@/lib/types";
import { dateKey } from "@/lib/reportUtils";
import { minutesToHoursDecimal } from "@/lib/utils/rounding";
import { buildDailyBreakdownRows } from "@/lib/reportDailyBreakdown";
import type { OvertimeReportRow } from "@/lib/reportOvertime";
import { HOURS_COLUMNS as H } from "@/lib/hoursColumns";

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
  overtimeRows = null,
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
  // Overtime (Task 1): only passed with the Overtime toggle ON (overrides
  // already applied). Adds the Overtime column; a day with 2+ jobs splits
  // into locked job rows + a day total. null = today's table, unchanged.
  overtimeRows?: OvertimeReportRow[] | null;
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
  const otRows = overtimeRows ? overtimeRows.filter((r) => r.date === currentDate) : null;
  const activeJobs = jobs.filter((j) => j.active);

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

      {otRows && (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {otRows.length === 0 ? (
            <p className="p-4 text-sm text-gray-600">No clock events on this day.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Job / hourly rate</th>
                  <th className="px-4 py-2 font-medium" title={H.shift.help}>{H.shift.label}</th>
                  <th className="px-4 py-2 font-medium" title={H.break.help}>{H.break.label}</th>
                  <th className="px-4 py-2 font-medium" title={H.regular.help}>{H.regular.label}</th>
                  <th className="px-4 py-2 font-medium" title={H.overtime.help}>{H.overtime.label}</th>
                  <th className="px-4 py-2 font-medium" title={H.worked.help}>{H.worked.label}</th>
                  <th className="px-4 py-2 font-medium">Est. pay</th>
                </tr>
              </thead>
              <tbody>
                {otRows.map((r) => (
                  <tr
                    key={r.key}
                    className={`border-b border-gray-200 last:border-0 ${r.kind === "total" ? "bg-gray-50 font-medium" : ""}`}
                  >
                    <td className="px-4 py-2.5 text-gray-950">
                      {r.kind === "job" ? <span className="text-gray-600">{r.employeeName}</span> : r.employeeName}
                      {r.incomplete && r.kind !== "job" && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Missing clock-out
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.kind === "single" ? (
                        <select
                          value={r.overrideJobId}
                          onChange={(e) => onOverrideChange(r.employeeId, currentDate, e.target.value)}
                          className="rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                        >
                          <option value="">
                            {r.overrideJobId ? "Approve Hours job" : r.jobLabel}
                            {r.rate != null && !r.overrideJobId ? ` - $${r.rate.toFixed(2)}/hr` : ""}
                          </option>
                          {activeJobs.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.name} - ${j.hourlyRate.toFixed(2)}/hr
                            </option>
                          ))}
                        </select>
                      ) : r.kind === "job" ? (
                        <span className="text-gray-950" title="2 or more jobs this day - change them on Approve Hours">
                          {r.jobLabel}
                          {r.rate != null ? ` - $${r.rate.toFixed(2)}/hr` : ""}
                        </span>
                      ) : (
                        <span className="text-gray-950">Day total</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-950">{minutesToHoursDecimal(r.clockedMinutes)}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-950">{minutesToHoursDecimal(r.breakMinutes)}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-950">{minutesToHoursDecimal(r.workedMinutes - r.overtimeMinutes)}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-950">{minutesToHoursDecimal(r.overtimeMinutes)}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-950">{minutesToHoursDecimal(r.workedMinutes)}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-950">
                      {r.pay != null ? `$${r.pay.toFixed(2)}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!otRows && (
      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">No clock events on this day.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Job / hourly rate</th>
                <th className="px-4 py-2 font-medium" title={H.shift.help}>{H.shift.label}</th>
                <th className="px-4 py-2 font-medium" title={H.break.help}>{H.break.label}</th>
                <th className="px-4 py-2 font-medium" title={H.worked.help}>{H.worked.label}</th>
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
      )}
    </div>
  );
}
