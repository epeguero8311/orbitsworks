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

// The previous equivalent period, same length, immediately before
// `start` - used for the stat cards' "vs previous period" comparison.
export function previousEquivalentRange(start: string, end: string): { start: string; end: string } {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const lengthDays = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  const prevEnd = addDays(startDate, -1);
  const prevStart = addDays(prevEnd, -(lengthDays - 1));
  return { start: dateKey(prevStart), end: dateKey(prevEnd) };
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
