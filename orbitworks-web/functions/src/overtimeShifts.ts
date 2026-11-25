import type { MinimalClockEvent } from "./clockStatus";
import { DEFAULT_OVERTIME_TIME_ZONE, type OvertimeSettings, type OvertimeShiftInput } from "./overtime";

// Overtime (Task 1) - server-side glue for the shared overtime function
// (overtime.ts): company settings off the company doc, and one employee's
// clock events turned into shifts. Used by the alert sweep (alerts.ts) when
// the company's Overtime toggle is ON. Pure, no Firestore calls.

const HOUR_MS = 60 * 60 * 1000;
const ROUNDING = [0, 5, 15, 30];

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Same fields and fallbacks as the website (useCompanySettings.ts
// resolveOvertimeFields): Overtime OFF unless explicitly true, daily 0,
// week starts Monday, no OT rounding, company time zone else Chicago.
export function companyOvertimeSettings(data: Record<string, unknown>): OvertimeSettings {
  const exportSettings = (data.exportSettings ?? {}) as Record<string, unknown>;
  const weekday = data.overtimeWeekStartsOn;
  const round = data.overtimeRoundMinutes;
  return {
    enabled: data.overtimeEnabled === true,
    weeklyThresholdHours: num(data.weeklyOvertimeThreshold, 40),
    dailyThresholdHours: Math.max(0, num(data.dailyOvertimeThreshold, 0)),
    weekStartsOn:
      typeof weekday === "number" && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 1,
    multiplier: num(data.overtimeMultiplier, 1.5),
    roundOvertimeMinutes: (typeof round === "number" && ROUNDING.includes(round) ? round : 0) as 0 | 5 | 15 | 30,
    automaticBreakMinutes: num(exportSettings.automaticBreakMinutes, 0),
    minimumShiftHours: num(exportSettings.minimumShiftHours, 0),
    timeZone: typeof data.timezone === "string" && data.timezone ? data.timezone : DEFAULT_OVERTIME_TIME_ZONE,
  };
}

function eventMs(event: MinimalClockEvent): number | null {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  return ts ? ts.toDate().getTime() : null;
}

// One employee's clock events -> shifts for computeOvertime. Same rules as
// splitShiftSegments (autoBreak.ts): a new "in" before an "out" drops the
// stale shift (its end is unknown - never assumed); only the trailing
// still-open shift comes back with endMs null (the caller passes nowMs so
// it counts up to now). Events before the first "in" are ignored. With
// nowMs, a break still running on the open shift counts as break up to now
// (worked time stops while on break).
export function shiftsFromClockEvents(events: MinimalClockEvent[], nowMs?: number): OvertimeShiftInput[] {
  const sorted = [...events].sort((a, b) => (eventMs(a) ?? 0) - (eventMs(b) ?? 0));
  const shifts: OvertimeShiftInput[] = [];
  let start: { id: string; ms: number } | null = null;
  let breakMs = 0;
  let openBreakStart: number | null = null;

  for (const event of sorted) {
    const ts = eventMs(event);
    if (ts == null) continue;
    switch (event.type) {
      case "in":
        start = { id: event.id, ms: ts };
        breakMs = 0;
        openBreakStart = null;
        break;
      case "breakStart":
        if (start && openBreakStart == null) openBreakStart = ts;
        break;
      case "breakEnd":
        if (openBreakStart != null) {
          if (ts - openBreakStart > 0) breakMs += ts - openBreakStart;
          openBreakStart = null;
        }
        break;
      case "out":
        if (start) {
          if (ts - start.ms > 0) shifts.push({ id: start.id, startMs: start.ms, endMs: ts, breakMs, jobId: null });
          start = null;
          breakMs = 0;
          openBreakStart = null;
        }
        break;
    }
  }
  if (start) {
    const runningBreak = openBreakStart != null && nowMs !== undefined ? Math.max(0, nowMs - openBreakStart) : 0;
    shifts.push({ id: start.id, startMs: start.ms, endMs: null, breakMs: breakMs + runningBreak, jobId: null });
  }
  return shifts;
}

export function hoursOf(ms: number): number {
  return ms / HOUR_MS;
}

// Plan text for the company Overtime alert (Overview feed, supervisor app,
// push body): "{Name} has reached overtime ({X}h)". X = hours worked this
// week, rounded down to one decimal like the employee alert texts.
export function overtimeAlertMessage(employeeName: string, weekHours: number): string {
  const v = Math.floor(weekHours * 10) / 10;
  const label = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${employeeName} has reached overtime (${label}h)`;
}
