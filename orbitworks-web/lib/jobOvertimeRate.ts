import type { OvertimeRateHistoryEntry } from "./types";

// Overtime (Task 1), Titles & Pay: a title's optional fixed Overtime rate.
// Pure helpers, no Firebase imports (unit-tested in
// test/jobOvertimeRate.test.mjs).

// The warning floor is a literal 1.5x the title's hourly rate (the usual
// legal minimum for overtime), NOT the company's Overtime Pay multiplier.
// It only warns - a lower rate still saves.
export const OVERTIME_RATE_FLOOR_MULTIPLIER = 1.5;

// Same sentinel as lib/rateHistory.ts: the OT rate in effect before the
// first tracked change applies to every earlier date.
const OVERTIME_RATE_HISTORY_EPOCH = "1970-01-01";

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function overtimeRateFloor(hourlyRate: number): number {
  return roundCents(hourlyRate * OVERTIME_RATE_FLOOR_MULTIPLIER);
}

// True when a fixed OT rate is set and is below 1.5x the hourly rate.
// Compared in cents so $34.50 against a $23.00 rate isn't flagged by float
// noise.
export function isBelowOvertimeFloor(hourlyRate: number, overtimeRate: number | null | undefined): boolean {
  if (overtimeRate == null) return false;
  return Math.round(overtimeRate * 100) < Math.round(hourlyRate * OVERTIME_RATE_FLOOR_MULTIPLIER * 100);
}

// Parses the optional Overtime rate input: blank = no fixed rate (null),
// otherwise a non-negative number. Returns undefined for anything invalid.
export function parseOvertimeRateInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return roundCents(value);
}

export function appendOvertimeRateHistory(
  history: OvertimeRateHistoryEntry[] | undefined,
  previousOvertimeRate: number | null,
  newOvertimeRate: number | null,
  effectiveFrom: string
): OvertimeRateHistoryEntry[] {
  const seeded =
    history && history.length > 0
      ? history
      : [{ overtimeRate: previousOvertimeRate, effectiveFrom: OVERTIME_RATE_HISTORY_EPOCH }];
  return [...seeded, { overtimeRate: newOvertimeRate, effectiveFrom }];
}

// The title's fixed OT rate in effect on `day` (yyyy-mm-dd), or null when
// none was set then. No history = the current value applies to every day.
export function overtimeRateAsOf(
  day: string,
  history: OvertimeRateHistoryEntry[] | undefined,
  currentOvertimeRate: number | null | undefined
): number | null {
  if (!history || history.length === 0) return currentOvertimeRate ?? null;
  const sorted = [...history].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  let applicable = sorted[0];
  for (const entry of sorted) {
    if (entry.effectiveFrom <= day) applicable = entry;
    else break;
  }
  return applicable.overtimeRate ?? null;
}
