import { localDateKey, localMinutesOfDay } from "./shared";
import { effectiveDate, type MinimalClockEvent } from "./clockStatus";
import type { EmployeeAlertType } from "./employeeAlertTypes";

// ---- Employee App Phase 7: when the sweep's employee alerts are due ----
//
// Pure (no Firestore) so functions/test/employeeShiftAlerts.test.js can run
// them at fixed times. Times of day are in COMPANY_TIMEZONE (shared.ts),
// same as every other alert.

// Shift ending fires this many minutes before business close.
export const SHIFT_ENDING_LEAD_MINUTES = 15;
// "Missed clock out alert" delay when the company never set one.
export const DEFAULT_STILL_CLOCKED_IN_DELAY_MINUTES = 30;

// The open shift's first event: the first event after the employee's last
// clock-out (normally the clock-in). Same sort and the same slice as
// clockStatus.ts getAccumulatedWorkedMs, so hours and the shift agree.
// null = no events, or the latest one is a clock-out.
export function openShiftStart(employeeEvents: MinimalClockEvent[]): MinimalClockEvent | null {
  const ms = (e: MinimalClockEvent) => effectiveDate(e)?.getTime() ?? 0;
  const sorted = [...employeeEvents].sort((a, b) => ms(a) - ms(b));
  let start = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].type === "out") {
      start = i + 1;
      break;
    }
  }
  return sorted[start] ?? null;
}

// "17:00" -> 1020 minutes; anything else -> null.
export function parseHHMM(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// 1020 -> "5:00 PM"
export function formatMinutesOfDay(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

interface DueInput {
  shiftStartMs: number;
  nowMs: number;
  closeMinutes: number;
}

// Both checks only count a shift that started on today's date, before
// close. A shift started after close (an overnight crew) gets neither.
function startedTodayBeforeClose({ shiftStartMs, nowMs, closeMinutes }: DueInput): boolean {
  const start = new Date(shiftStartMs);
  if (localDateKey(start) !== localDateKey(new Date(nowMs))) return false;
  return localMinutesOfDay(start) < closeMinutes;
}

// Due from 15 min before close until close. The sweep runs every 15 min,
// so one run lands in that window; the alert id makes it once per shift.
export function shiftEndingDue(input: DueInput): boolean {
  if (!startedTodayBeforeClose(input)) return false;
  const nowMin = localMinutesOfDay(new Date(input.nowMs));
  return nowMin >= input.closeMinutes - SHIFT_ENDING_LEAD_MINUTES && nowMin < input.closeMinutes;
}

// Due from close + the delay until midnight (once per shift, by alert id).
export function stillClockedInDue(input: DueInput & { delayMinutes: number }): boolean {
  if (!startedTodayBeforeClose(input)) return false;
  const delay = Number.isFinite(input.delayMinutes) && input.delayMinutes >= 0 ? input.delayMinutes : DEFAULT_STILL_CLOCKED_IN_DELAY_MINUTES;
  return localMinutesOfDay(new Date(input.nowMs)) >= input.closeMinutes + delay;
}

export interface EmployeeAlertText {
  alertType: EmployeeAlertType;
  title: string;
  message: string;
  reason: string;
}

// 8.25 -> "8.2" (rounded down, so it never says more than was worked).
function hoursLabel(hours: number): string {
  const v = Math.floor(hours * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function shiftEndingText(closeMinutes: number): EmployeeAlertText {
  const close = formatMinutesOfDay(closeMinutes);
  return {
    alertType: "shiftEnding",
    title: "Shift ending soon",
    message: `Your company closes at ${close}. Remember to clock out when you finish.`,
    reason: `Sent ${SHIFT_ENDING_LEAD_MINUTES} minutes before your company's closing time (${close}).`,
  };
}

export function stillClockedInText(closeMinutes: number, delayMinutes: number): EmployeeAlertText {
  const close = formatMinutesOfDay(closeMinutes);
  return {
    alertType: "stillClockedIn",
    title: "Still clocked in",
    message: "You are still clocked in. Clock out if you are done working.",
    reason: `Your company closes at ${close} and you were still clocked in ${delayMinutes} minutes later.`,
  };
}

export function maxHoursText(workedHours: number, thresholdHours: number): EmployeeAlertText {
  return {
    alertType: "maxHours",
    title: "Max hours",
    message: `You have worked ${hoursLabel(workedHours)} hours this shift.`,
    reason: `Your company warns after ${thresholdHours} hours in one shift.`,
  };
}

// Phase 8 - the employee's own Alerts tab entry for leaving the job site.
// Written when the exit syncs, never pushed (the phone already showed its
// own "You have left the job site" notification at the time).
export function leftSiteText(siteName: string, startMs: number): EmployeeAlertText {
  const site = siteName || "the job site";
  const time = formatMinutesOfDay(localMinutesOfDay(new Date(startMs)));
  return {
    alertType: "leftSite",
    title: "You have left the job site",
    message: `You left ${site} at ${time}.`,
    reason: "Your company flags leaving the job site while you are clocked in. You were outside its area for 2 minutes.",
  };
}

export function overtimeText(weekHours: number, thresholdHours: number): EmployeeAlertText {
  return {
    alertType: "overtime",
    title: "Overtime",
    message: `You have worked ${hoursLabel(weekHours)} hours this week.`,
    reason: `Your company's weekly overtime limit is ${thresholdHours} hours.`,
  };
}
