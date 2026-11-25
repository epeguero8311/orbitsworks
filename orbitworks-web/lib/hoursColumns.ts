// Hours columns (Task 1, Nov 25 change): one set of names, in this order,
// everywhere hours show - Reports page Summary + Daily Breakdown, Payroll
// CSV, Payroll Hours Excel (incl. Full Report), Time History Excel.
//
//   Shift Hours | Break | Regular Hours | Overtime | Total Worked
//
// Regular Hours and Overtime only appear when the company's Overtime toggle
// is ON. Overtime OFF: same numbers as before, only the labels changed.
// The descriptions are the Reports page header tooltips and the Excel
// header notes.

export const HOURS_COLUMNS = {
  shift: { label: "Shift Hours", help: "Total shift duration" },
  break: { label: "Break", help: "Unpaid break" },
  regular: { label: "Regular Hours", help: "Hours up to the OT threshold" },
  overtime: { label: "Overtime", help: "Hours over the OT threshold" },
  worked: { label: "Total Worked", help: "Regular + OT" },
} as const;

export type HoursColumnKey = keyof typeof HOURS_COLUMNS;

// Excel header notes for the hours columns of one header row: pass the
// header row and which column number holds which hours column.
export function addHoursHeaderNotes(row: { getCell: (n: number) => { note?: unknown } }, columns: Partial<Record<HoursColumnKey, number>>) {
  for (const [key, col] of Object.entries(columns) as [HoursColumnKey, number][]) {
    row.getCell(col).note = HOURS_COLUMNS[key].help;
  }
}

// The Summary "Hourly Rate" for an employee who worked 2+ jobs in the
// period (Overtime ON) - a single rate would be misleading.
export const MIXED_RATE_LABEL = "Mixed";
