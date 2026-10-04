import type { RoundingIncrement } from "@/lib/types";

// Pure payroll-rounding math. No Firebase imports - every function here
// takes plain numbers (integer minutes) and returns plain numbers, so it
// can be unit tested in isolation and reused by both the on-screen Daily
// Breakdown and the CSV export without a second calculation path.

// Rounds UP to the nearest increment. 0 means "off" (no rounding) and a
// value already on the mark stays the same.
export function ceilTo(minutes: number, incrementMinutes: RoundingIncrement): number {
  if (incrementMinutes === 0) return minutes;
  return Math.ceil(minutes / incrementMinutes) * incrementMinutes;
}

// hours (as stored in hoursByEmployeeDay/breakHoursByEmployeeDay, which are
// summed from millisecond durations) -> whole minutes for this pipeline.
export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function minutesToHoursDecimal(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

// Per employee per calendar day: break comes off BEFORE rounding, and only
// the worked minutes get rounded - clocked minutes and break minutes never
// do. Never goes negative (a break can't exceed what was clocked).
export function computeDailyWorkedMinutes(
  clockedMinutes: number,
  breakMinutes: number
): number {
  return Math.max(0, clockedMinutes - breakMinutes);
}

export function computeDailyPaidMinutes(
  clockedMinutes: number,
  breakMinutes: number,
  roundDailyMinutes: RoundingIncrement
): number {
  const workedMinutes = computeDailyWorkedMinutes(clockedMinutes, breakMinutes);
  return ceilTo(workedMinutes, roundDailyMinutes);
}

// Sum of each day's already-rounded paid minutes, then rounded once more
// for the total. Never round per session or re-round the daily figures.
export function computeTotalPaidMinutes(
  dailyPaidMinutesList: number[],
  roundTotalMinutes: RoundingIncrement
): number {
  const sum = dailyPaidMinutesList.reduce((a, b) => a + b, 0);
  return ceilTo(sum, roundTotalMinutes);
}
