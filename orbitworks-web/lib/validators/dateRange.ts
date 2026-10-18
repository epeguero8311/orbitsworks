import { dateKey, startOfWeek } from "@/lib/reportUtils";

export type DateRangePreset = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// Resolves a preset (relative to `now`) to an inclusive [start, end] date
// range. "custom" isn't resolved here - callers keep whatever start/end
// the date inputs already hold.
export function resolvePreset(
  preset: DateRangePreset,
  now: Date
): { start: string; end: string } | null {
  switch (preset) {
    case "thisWeek": {
      const start = startOfWeek(now);
      return { start: dateKey(start), end: dateKey(now) };
    }
    case "lastWeek": {
      const start = addDays(startOfWeek(now), -7);
      const end = addDays(start, 6);
      return { start: dateKey(start), end: dateKey(end) };
    }
    case "thisMonth": {
      return { start: dateKey(startOfMonth(now)), end: dateKey(now) };
    }
    case "lastMonth": {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: dateKey(startOfMonth(lastMonthDate)), end: dateKey(endOfMonth(lastMonthDate)) };
    }
    case "custom":
      return null;
  }
}

// Same length, immediately before `start` - the only sensible comparison
// for "custom", since it has no calendar unit to align to.
function rollingPreviousRange(start: string, end: string): { start: string; end: string } {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const lengthDays = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  const prevEnd = addDays(startDate, -1);
  const prevStart = addDays(prevEnd, -(lengthDays - 1));
  return { start: dateKey(prevStart), end: dateKey(prevEnd) };
}

// The comparison range for the stat cards' "up/down X% vs <period>" line.
// For the calendar presets this is the actual prior calendar unit (not a
// rolling N-day shift), so a partial "this month so far" compares against
// the SAME elapsed days at the start of last month (month-to-date vs
// month-to-date), and a complete "last month" compares against the full
// month before it. Only "custom" falls back to a rolling shift, since it
// has no calendar unit to align to.
export function previousComparisonRange(
  preset: DateRangePreset,
  start: string,
  end: string,
  now: Date
): { start: string; end: string } {
  const elapsedDays =
    Math.round(
      (new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime()) / 86_400_000
    ) + 1;

  switch (preset) {
    case "thisWeek": {
      const prevWeekStart = addDays(startOfWeek(now), -7);
      return { start: dateKey(prevWeekStart), end: dateKey(addDays(prevWeekStart, elapsedDays - 1)) };
    }
    case "lastWeek": {
      const startDate = new Date(start + "T00:00:00");
      const endDate = new Date(end + "T00:00:00");
      return { start: dateKey(addDays(startDate, -7)), end: dateKey(addDays(endDate, -7)) };
    }
    case "thisMonth": {
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthStart = startOfMonth(prevMonthDate);
      const prevMonthEnd = endOfMonth(prevMonthDate);
      const candidateEnd = addDays(prevMonthStart, elapsedDays - 1);
      const prevEnd = candidateEnd.getTime() < prevMonthEnd.getTime() ? candidateEnd : prevMonthEnd;
      return { start: dateKey(prevMonthStart), end: dateKey(prevEnd) };
    }
    case "lastMonth": {
      const thisMonthStart = new Date(start + "T00:00:00");
      const twoMonthsAgo = new Date(thisMonthStart.getFullYear(), thisMonthStart.getMonth() - 1, 1);
      return { start: dateKey(startOfMonth(twoMonthsAgo)), end: dateKey(endOfMonth(twoMonthsAgo)) };
    }
    case "custom":
      return rollingPreviousRange(start, end);
  }
}

export function previousPeriodLabel(preset: DateRangePreset): string {
  switch (preset) {
    case "thisWeek":
    case "lastWeek":
      return "vs last week";
    case "thisMonth":
    case "lastMonth":
      return "vs last month";
    case "custom":
      return "vs previous period";
  }
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
