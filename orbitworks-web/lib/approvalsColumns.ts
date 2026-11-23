// Timesheet Approvals table column widths (moved out of ApprovalsTable.tsx
// in Phase 10 so they can be tested). No imports, so
// test/phase10Lib.test.mjs runs it under plain Node.
//
// The checkbox column is a fixed 40px. Every other column is a percentage
// of the table's own width, scaled down by the same 40px (via calc) so the
// full set of columns always sums to exactly 100% of the card - the table
// never needs a horizontal scrollbar on a desktop window.
//
// Phase 10 (W6, D13 a): no Shift column any more (Worked + Break already
// say it). Its 7% went to Name (+3) and Time (+4), so names and the in-out
// times wrap less on a laptop-width window. Both variants still total 100.

export const CHECKBOX_COLUMN_WIDTH = "40px";
const CHECKBOX_COLUMN_PX = 40;

export const DAY_PERCENTAGES = {
  name: 18,
  company: 11,
  site: 10,
  job: 12,
  time: 18,
  breakCol: 7,
  worked: 7,
  status: 17,
};

export const WEEK_PERCENTAGES = {
  date: 8,
  name: 15,
  company: 10,
  site: 10,
  job: 12,
  time: 14,
  breakCol: 7,
  worked: 7,
  status: 17,
};

export function scaledWidth(percent: number): string {
  const reservedPx = (percent * CHECKBOX_COLUMN_PX) / 100;
  return `calc(${percent}% - ${reservedPx}px)`;
}

// checkbox + (Date in week mode) + Name/Company/Site/Job/Time/Break/Worked/
// Status - the pencil/trash actions live inside the Status cell.
export function buildColumnWidths(mode: "day" | "week"): string[] {
  const p = mode === "week" ? WEEK_PERCENTAGES : DAY_PERCENTAGES;
  const date = mode === "week" ? [scaledWidth(WEEK_PERCENTAGES.date)] : [];
  return [
    CHECKBOX_COLUMN_WIDTH,
    ...date,
    scaledWidth(p.name),
    scaledWidth(p.company),
    scaledWidth(p.site),
    scaledWidth(p.job),
    scaledWidth(p.time),
    scaledWidth(p.breakCol),
    scaledWidth(p.worked),
    scaledWidth(p.status),
  ];
}

// How many columns a full-width row (loading / empty message) spans.
export function approvalsColumnCount(mode: "day" | "week"): number {
  return mode === "week" ? 10 : 9;
}
