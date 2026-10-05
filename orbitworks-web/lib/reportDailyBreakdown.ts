import type { EmployeeSummary, Job, RoundingIncrement } from "@/lib/types";
import {
  ceilTo,
  computeDailyPaidMinutes,
  hoursToMinutes,
} from "@/lib/utils/rounding";

// One employee, one calendar day. Built once from hoursByEmployeeDay /
// breakHoursByEmployeeDay (same maps the Excel export and the old
// PayrollDayView already used) so the on-screen Daily Breakdown and its
// CSV export read from the exact same numbers - no second calculation path.
export type DailyBreakdownRow = {
  key: string; // employeeId__yyyy-mm-dd
  employeeId: string;
  employeeName: string;
  date: string;
  overrideJobId: string;
  jobLabel: string; // job name, or "Default" when no override is set
  rate: number | null;
  clockedMinutes: number; // "Hours" - gross clocked time, never rounded
  breakMinutes: number; // "Break" - never rounded
  workedMinutes: number; // "Worked Hours" - break subtracted, then rounded
  pay: number | null;
};

export function buildDailyBreakdownRows(
  summaries: EmployeeSummary[],
  hoursByEmployeeDay: Map<string, number>,
  breakHoursByEmployeeDay: Map<string, number>,
  jobs: Job[],
  overrides: Record<string, string>,
  roundDailyMinutes: RoundingIncrement
): DailyBreakdownRow[] {
  const summaryById = new Map(summaries.map((s) => [s.employeeId, s]));

  const rows: DailyBreakdownRow[] = [];
  for (const [key, hours] of hoursByEmployeeDay) {
    const clockedMinutes = hoursToMinutes(hours);
    if (clockedMinutes <= 0) continue;

    const sep = key.indexOf("__");
    if (sep === -1) continue;
    const employeeId = key.slice(0, sep);
    const date = key.slice(sep + 2);
    const summary = summaryById.get(employeeId);
    if (!summary) continue;

    const breakMinutes = hoursToMinutes(breakHoursByEmployeeDay.get(key) ?? 0);
    const workedMinutes = computeDailyPaidMinutes(
      clockedMinutes,
      breakMinutes,
      roundDailyMinutes
    );

    const overrideJobId = overrides[key] ?? "";
    const overrideJob = overrideJobId ? jobs.find((j) => j.id === overrideJobId) : null;
    const rate = overrideJob ? overrideJob.hourlyRate : summary.hourlyRate;
    const pay = rate != null ? (workedMinutes / 60) * rate : null;

    rows.push({
      key,
      employeeId,
      employeeName: summary.employeeName,
      date,
      overrideJobId,
      jobLabel: overrideJob ? overrideJob.name : "Default",
      rate,
      clockedMinutes,
      breakMinutes,
      workedMinutes,
      pay,
    });
  }

  rows.sort((a, b) =>
    a.employeeName === b.employeeName
      ? a.date < b.date
        ? -1
        : 1
      : a.employeeName.localeCompare(b.employeeName)
  );
  return rows;
}

export type EmployeeRoundedTotal = {
  totalWorkedMinutes: number;
  totalPay: number | null;
};

// Rolls the already daily-rounded rows up to one total per employee, then
// rounds that total once more. Pay adds the extra minutes total rounding
// contributes at the employee's default rate on top of the day-by-day pay
// sum (which already reflects any per-day job-override rate) - with a
// single constant rate this is exactly "rounded total hours x hourlyRate",
// and it degrades gracefully instead of silently dropping day overrides
// when a mix of rates is in play.
export function computeEmployeeRoundedTotals(
  rows: DailyBreakdownRow[],
  roundTotalMinutes: RoundingIncrement
): Map<string, EmployeeRoundedTotal> {
  const minutesByEmployee = new Map<string, number>();
  const paySumByEmployee = new Map<string, number>();
  const rateByEmployee = new Map<string, number | null>();

  for (const row of rows) {
    minutesByEmployee.set(
      row.employeeId,
      (minutesByEmployee.get(row.employeeId) ?? 0) + row.workedMinutes
    );
    if (row.pay != null) {
      paySumByEmployee.set(row.employeeId, (paySumByEmployee.get(row.employeeId) ?? 0) + row.pay);
    }
    if (!rateByEmployee.has(row.employeeId)) {
      rateByEmployee.set(row.employeeId, row.overrideJobId ? null : row.rate);
    } else if (!row.overrideJobId && row.rate != null) {
      rateByEmployee.set(row.employeeId, row.rate);
    }
  }

  const totals = new Map<string, EmployeeRoundedTotal>();
  for (const [employeeId, sumMinutes] of minutesByEmployee) {
    const totalWorkedMinutes = ceilTo(sumMinutes, roundTotalMinutes);
    const extraMinutes = totalWorkedMinutes - sumMinutes;
    const defaultRate = rateByEmployee.get(employeeId) ?? null;
    const paySum = paySumByEmployee.get(employeeId) ?? null;
    const totalPay =
      paySum != null && defaultRate != null
        ? paySum + (extraMinutes / 60) * defaultRate
        : paySum;
    totals.set(employeeId, { totalWorkedMinutes, totalPay });
  }
  return totals;
}
