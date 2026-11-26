import type { RoundingIncrement } from "@/lib/types";

// The hours a report row SHOWS (decimal hours, 2 places), worked out once
// per row so the Reports page, the Payroll CSV and the Payroll Hours Excel
// show the same numbers and every row adds up on paper:
//
//   Shift Hours - Break = Total Worked      Regular + Overtime = Total Worked
//
// Input is whole minutes per day (shift and break each rounded to the
// minute, worked = shift - break, plus any "Round daily worked hours"
// extra). Rounding each value to 2 places on its own can break the sum by
// 0.01 (10 min shift, 5 min break: 0.17 - 0.08 = 0.09, worked 0.08), so
// Break is shown as Shift - Worked. Break is never paid, so this moves no
// pay; Shift and Worked are exactly their own minutes / 60.
//
// With daily rounding ON the worked minutes include the rounded-up extra,
// so Total Worked is MORE than Shift - Break by design - then Break shows
// its own minutes.

export type HoursDisplay = {
  shift: number;
  brk: number;
  regular: number;
  overtime: number;
  worked: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function hoursDisplay(
  clockedMinutes: number,
  breakMinutes: number,
  workedMinutes: number,
  overtimeMinutes = 0
): HoursDisplay {
  const shift = r2(clockedMinutes / 60);
  const worked = r2(workedMinutes / 60);
  const overtime = r2(overtimeMinutes / 60);
  const addsUp = workedMinutes === Math.max(0, clockedMinutes - breakMinutes);
  return {
    shift,
    brk: addsUp ? r2(shift - worked) : r2(breakMinutes / 60),
    regular: r2(worked - overtime),
    overtime,
    worked,
  };
}

// Column sums of shown rows (a Day total row, a Summary row) - the same
// numbers Excel's SUM / SUMIFS of the row cells gives.
export function sumHoursDisplay(rows: HoursDisplay[]): HoursDisplay {
  const sum = (k: keyof HoursDisplay) => r2(rows.reduce((s, h) => s + h[k], 0));
  return { shift: sum("shift"), brk: sum("brk"), regular: sum("regular"), overtime: sum("overtime"), worked: sum("worked") };
}

export const showHours = (h: number) => h.toFixed(2);

// Summary shown hours with "Round total worked hours": Total Worked is the
// summed shown hours rounded up (Excel: CEILING(sum, increment / 60)).
export function totalHoursShown(sum: HoursDisplay, roundTotalMinutes: RoundingIncrement): HoursDisplay {
  if (roundTotalMinutes === 0) return sum;
  const worked = Math.round((Math.ceil(Math.round(sum.worked * 60) / roundTotalMinutes) * roundTotalMinutes) / 60 * 100) / 100;
  return { ...sum, worked, regular: Math.round((worked - sum.overtime) * 100) / 100 };
}
