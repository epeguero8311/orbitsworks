// Overtime (Task 1) - the ONE shared overtime calculation.
//
// Pure: no Firebase, no imports at all. Mirrored byte-for-byte in
// functions/src/overtime.ts (functions/ is a separate npm package and can't
// import across the app/web boundary - same reasoning as autoBreak.ts).
// test/overtime.test.mjs checks the two files are identical, so edit both
// together.
//
// One call = one employee. Rules (docs/plans/overtime-columns-tips-plan.md,
// "How OT is calculated" + Task 1 decisions):
//  1. A shift belongs to the day it STARTED, in one time zone (company
//     time zone if the company has one, else America/Chicago). Weeks start
//     on settings.weekStartsOn.
//  2. All shifts on the same day are added together, whatever the gap.
//  3. OT counts WORKED time only: tracked breaks and Automatic Break are
//     excluded. With Overtime ON, Automatic Break is deducted ONCE per day,
//     based on the day's combined closed-shift hours. With Overtime OFF it is
//     the existing per-shift rule, unchanged (same as autoBreak.ts).
//  4. Daily OT only when dailyThresholdHours > 0.
//  5. No double counting: hours already counted as daily OT don't count
//     toward weekly OT. Weekly OT = max(0, regular hours this week - weekly
//     threshold).
//  6. OT lands on the shift/day where the threshold is crossed
//     (chronological).
//  7. OT pay uses the job worked during the OT hours: the job's fixed
//     Overtime rate if set, else job rate x multiplier. Subcontractors
//     (noOvertimePremium) get OT hours at their straight rate.
//  8. Pay = (regular hrs x job rate) + (OT hrs x OT rate).
//  9. OT is rounded UP per day (0/5/15/30 min); the period total is the sum
//     of the days. Rounding moves time from regular to OT - worked time
//     never changes.
// 10. Missing clock-out: the shift is flagged incomplete and counts 0 -
//     a clock-out time is never assumed. Only a caller that passes nowMs
//     (alerts, auto clock-out) counts a still-open shift up to now.
// Overtime OFF (enabled false): no OT at all, every worked hour is regular.

export const DEFAULT_OVERTIME_TIME_ZONE = "America/Chicago";

export type OvertimeRoundingIncrement = 0 | 5 | 15 | 30;

export interface OvertimeSettings {
  enabled: boolean;
  weeklyThresholdHours: number;
  // 0 = daily overtime off.
  dailyThresholdHours: number;
  // 0 = Sunday ... 6 = Saturday.
  weekStartsOn: number;
  multiplier: number;
  roundOvertimeMinutes: OvertimeRoundingIncrement;
  automaticBreakMinutes: number;
  minimumShiftHours: number;
  timeZone: string;
}

export interface OvertimeShiftInput {
  // The clock-in event id.
  id: string;
  startMs: number;
  // null = no clock-out (yet).
  endMs: number | null;
  // Real tracked break time inside this shift.
  breakMs: number;
  // The job worked on this shift (Approve Hours job, else the employee's
  // default job) - resolved by the caller.
  jobId: string | null;
  // Automatic Break settings frozen on this shift when it was approved
  // (timesheetApprovals autoBreak*Applied). Omitted = the live settings.
  // Overtime OFF: used for this shift. Overtime ON: the day uses the frozen
  // settings of its last closed shift (where the deduction lands).
  autoBreak?: { minutes: number; minimumShiftHours: number };
  // Rule 11: OT frozen on this shift when it was approved
  // (timesheetApprovals overtimeApplied). With Overtime ON it replaces the
  // live OT of this shift (capped at its worked time); other shifts are
  // still computed live. Omitted = live.
  frozenOvertimeMs?: number;
}

export interface OvertimeJobRates {
  // Straight $/hr. null = no rate known (pay comes back null).
  rate: number | null;
  // The job's fixed Overtime rate on that day, or null = rate x multiplier.
  overtimeRate: number | null;
}

export interface OvertimeOptions {
  // When set, a shift with no clock-out counts up to this moment (alerts,
  // auto clock-out). When omitted it counts 0 and is flagged incomplete.
  nowMs?: number;
  // Subcontractors: OT hours paid at the straight rate (no premium).
  noOvertimePremium?: boolean;
}

export interface OvertimeShiftResult {
  id: string;
  dayKey: string;
  weekKey: string;
  jobId: string | null;
  grossMs: number;
  // Tracked + Automatic Break actually deducted from this shift.
  breakMs: number;
  workedMs: number;
  regularMs: number;
  // Raw split before rounding (daily + weekly = OT before rounding).
  dailyOvertimeMs: number;
  weeklyOvertimeMs: number;
  // Final OT for this shift, after the day's rounding.
  overtimeMs: number;
  rate: number | null;
  // Effective OT $/hr (fixed Overtime rate, or rate x multiplier, or the
  // straight rate for noOvertimePremium). null when rate is unknown.
  overtimeRate: number | null;
  regularPay: number | null;
  overtimePay: number | null;
  pay: number | null;
  // No clock-out and not counted (no nowMs).
  incomplete: boolean;
  // No clock-out but counted up to nowMs.
  open: boolean;
  // OT came from frozenOvertimeMs (approved shift), not the live math.
  frozen: boolean;
}

export interface OvertimeDayJobResult {
  jobId: string | null;
  workedMs: number;
  regularMs: number;
  overtimeMs: number;
  regularPay: number | null;
  overtimePay: number | null;
  pay: number | null;
}

export interface OvertimeDayResult {
  dayKey: string;
  weekKey: string;
  workedMs: number;
  regularMs: number;
  overtimeMs: number;
  // Automatic Break deducted for the whole day (0 when none applied).
  automaticBreakMs: number;
  incomplete: boolean;
  shiftIds: string[];
  // One entry per job worked that day, in first-worked order.
  jobs: OvertimeDayJobResult[];
}

export interface OvertimeResult {
  shifts: OvertimeShiftResult[];
  days: OvertimeDayResult[];
  totals: {
    workedMs: number;
    regularMs: number;
    overtimeMs: number;
    // Sum of every shift's known pay.
    pay: number;
    // True when at least one shift with worked time had no rate.
    missingRate: boolean;
    hasIncomplete: boolean;
  };
}

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

// yyyy-mm-dd of `ms` in `timeZone`.
export function overtimeDayKey(ms: number, timeZone: string): string {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(ms));
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

// yyyy-mm-dd of the first day of the week containing dayKey. Pure calendar
// math on the date string, so DST never shifts it.
export function overtimeWeekKey(dayKey: string, weekStartsOn: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const weekday = new Date(utc).getUTCDay();
  const back = (weekday - weekStartsOn + 7) % 7;
  const start = new Date(utc - back * DAY_MS);
  const mm = String(start.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(start.getUTCDate()).padStart(2, "0");
  return `${start.getUTCFullYear()}-${mm}-${dd}`;
}

type WorkingShift = {
  input: OvertimeShiftInput;
  dayKey: string;
  weekKey: string;
  grossMs: number;
  realBreakMs: number;
  autoBreakMs: number;
  closed: boolean;
  incomplete: boolean;
  open: boolean;
  dailyOvertimeMs: number;
  weeklyOvertimeMs: number;
  overtimeMs: number;
  frozen: boolean;
};

function workedOf(s: WorkingShift): number {
  return Math.max(0, s.grossMs - s.realBreakMs - s.autoBreakMs);
}

function addPay(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a + b;
}

export function computeOvertime(
  shifts: OvertimeShiftInput[],
  settings: OvertimeSettings,
  ratesFor: (jobId: string | null, dayKey: string) => OvertimeJobRates,
  options: OvertimeOptions = {}
): OvertimeResult {
  const timeZone = settings.timeZone || DEFAULT_OVERTIME_TIME_ZONE;
  const autoBreakFor = (s: WorkingShift) => {
    const minutes = s.input.autoBreak ? s.input.autoBreak.minutes : settings.automaticBreakMinutes;
    const minHours = s.input.autoBreak ? s.input.autoBreak.minimumShiftHours : settings.minimumShiftHours;
    return { ms: Math.max(0, minutes) * MINUTE_MS, minShiftMs: Math.max(0, minHours) * HOUR_MS };
  };

  // ---- 1. Day/week placement, gross time, tracked breaks ----
  const working: WorkingShift[] = shifts
    .map((input) => {
      const dayKey = overtimeDayKey(input.startMs, timeZone);
      const closed = input.endMs !== null;
      const counted = closed || options.nowMs !== undefined;
      const endMs = closed ? (input.endMs as number) : (options.nowMs ?? input.startMs);
      const grossMs = counted ? Math.max(0, endMs - input.startMs) : 0;
      return {
        input,
        dayKey,
        weekKey: overtimeWeekKey(dayKey, settings.weekStartsOn),
        grossMs,
        realBreakMs: Math.min(Math.max(0, input.breakMs), grossMs),
        autoBreakMs: 0,
        closed,
        incomplete: !counted,
        open: !closed && counted,
        dailyOvertimeMs: 0,
        weeklyOvertimeMs: 0,
        overtimeMs: 0,
        frozen: false,
      };
    })
    .sort((a, b) => a.input.startMs - b.input.startMs || (a.input.id < b.input.id ? -1 : a.input.id > b.input.id ? 1 : 0));

  const dayOrder: string[] = [];
  const shiftsByDay = new Map<string, WorkingShift[]>();
  for (const s of working) {
    const list = shiftsByDay.get(s.dayKey);
    if (list) list.push(s);
    else {
      shiftsByDay.set(s.dayKey, [s]);
      dayOrder.push(s.dayKey);
    }
  }

  // ---- 2. Automatic Break ----
  const dayAutoBreakMs = new Map<string, number>();
  if (!settings.enabled) {
    // Overtime OFF: the existing per-shift rule (autoBreak.ts), closed
    // shifts only, each shift on its own gross hours.
    for (const s of working) {
      const ab = autoBreakFor(s);
      if (ab.ms <= 0 || !s.closed || s.grossMs < ab.minShiftMs) continue;
      s.autoBreakMs = Math.min(ab.ms, s.grossMs - s.realBreakMs);
      dayAutoBreakMs.set(s.dayKey, (dayAutoBreakMs.get(s.dayKey) ?? 0) + s.autoBreakMs);
    }
  } else {
    // Overtime ON: once per day, on the day's combined closed-shift gross
    // hours. Taken from the day's last closed shift first (earlier ones
    // only if it is shorter than the break).
    for (const dayKey of dayOrder) {
      const closed = (shiftsByDay.get(dayKey) ?? []).filter((s) => s.closed);
      if (closed.length === 0) continue;
      const ab = autoBreakFor(closed[closed.length - 1]);
      const combinedGross = closed.reduce((sum, s) => sum + s.grossMs, 0);
      if (ab.ms <= 0 || combinedGross < ab.minShiftMs) continue;
      let remaining = ab.ms;
      for (let i = closed.length - 1; i >= 0 && remaining > 0; i--) {
        const take = Math.min(remaining, workedOf(closed[i]));
        closed[i].autoBreakMs += take;
        remaining -= take;
      }
      dayAutoBreakMs.set(dayKey, ab.ms - remaining);
    }
  }

  // ---- 3. Daily + weekly OT, chronological, no double counting ----
  if (settings.enabled) {
    const dailyMs = Math.max(0, settings.dailyThresholdHours) * HOUR_MS;
    const weeklyMs = Math.max(0, settings.weeklyThresholdHours) * HOUR_MS;
    const dayWorkedSoFar = new Map<string, number>();
    const weekRegularSoFar = new Map<string, number>();
    for (const s of working) {
      const worked = workedOf(s);
      if (dailyMs > 0) {
        const before = dayWorkedSoFar.get(s.dayKey) ?? 0;
        const after = before + worked;
        s.dailyOvertimeMs = Math.max(0, after - dailyMs) - Math.max(0, before - dailyMs);
        dayWorkedSoFar.set(s.dayKey, after);
      }
      if (weeklyMs > 0) {
        const regularPart = worked - s.dailyOvertimeMs;
        const before = weekRegularSoFar.get(s.weekKey) ?? 0;
        const after = before + regularPart;
        s.weeklyOvertimeMs = Math.max(0, after - weeklyMs) - Math.max(0, before - weeklyMs);
        weekRegularSoFar.set(s.weekKey, after);
      }
      s.overtimeMs = s.dailyOvertimeMs + s.weeklyOvertimeMs;
    }

    // ---- 4. Round each day's OT up; the extra comes out of regular time,
    // latest shift first. Worked time is unchanged.
    const roundMs = settings.roundOvertimeMinutes * MINUTE_MS;
    if (roundMs > 0) {
      for (const dayKey of dayOrder) {
        const dayShifts = shiftsByDay.get(dayKey) ?? [];
        const rawOt = dayShifts.reduce((sum, s) => sum + s.overtimeMs, 0);
        if (rawOt <= 0) continue;
        const dayWorked = dayShifts.reduce((sum, s) => sum + workedOf(s), 0);
        let extra = Math.min(Math.ceil(rawOt / roundMs) * roundMs, dayWorked) - rawOt;
        for (let i = dayShifts.length - 1; i >= 0 && extra > 0; i--) {
          const s = dayShifts[i];
          const take = Math.min(extra, workedOf(s) - s.overtimeMs);
          s.overtimeMs += take;
          extra -= take;
        }
      }
    }
  }

  // ---- 4b. Frozen OT on approved shifts (rule 11) ----
  if (settings.enabled) {
    for (const s of working) {
      const frozen = s.input.frozenOvertimeMs;
      if (frozen === undefined) continue;
      s.overtimeMs = Math.min(Math.max(0, frozen), workedOf(s));
      s.frozen = true;
    }
  }

  // ---- 5. Pay per shift ----
  const shiftResults: OvertimeShiftResult[] = working.map((s) => {
    const workedMs = workedOf(s);
    const regularMs = workedMs - s.overtimeMs;
    const rates = ratesFor(s.input.jobId, s.dayKey);
    const rate = rates.rate;
    const overtimeRate =
      rate === null
        ? null
        : options.noOvertimePremium
          ? rate
          : rates.overtimeRate ?? rate * settings.multiplier;
    const regularPay = rate === null ? null : (regularMs / HOUR_MS) * rate;
    const overtimePay = overtimeRate === null ? null : (s.overtimeMs / HOUR_MS) * overtimeRate;
    return {
      id: s.input.id,
      dayKey: s.dayKey,
      weekKey: s.weekKey,
      jobId: s.input.jobId,
      grossMs: s.grossMs,
      breakMs: s.realBreakMs + s.autoBreakMs,
      workedMs,
      regularMs,
      dailyOvertimeMs: s.dailyOvertimeMs,
      weeklyOvertimeMs: s.weeklyOvertimeMs,
      overtimeMs: s.overtimeMs,
      rate,
      overtimeRate,
      regularPay,
      overtimePay,
      pay: addPay(regularPay, overtimePay),
      incomplete: s.incomplete,
      open: s.open,
      frozen: s.frozen,
    };
  });

  // ---- 6. Days (with a per-job split) and totals ----
  const resultsByDay = new Map<string, OvertimeShiftResult[]>();
  for (const r of shiftResults) {
    const list = resultsByDay.get(r.dayKey);
    if (list) list.push(r);
    else resultsByDay.set(r.dayKey, [r]);
  }

  const days: OvertimeDayResult[] = dayOrder.map((dayKey) => {
    const dayShifts = resultsByDay.get(dayKey) ?? [];
    const jobs: OvertimeDayJobResult[] = [];
    for (const r of dayShifts) {
      let job = jobs.find((j) => j.jobId === r.jobId);
      if (!job) {
        job = { jobId: r.jobId, workedMs: 0, regularMs: 0, overtimeMs: 0, regularPay: 0, overtimePay: 0, pay: 0 };
        jobs.push(job);
      }
      job.workedMs += r.workedMs;
      job.regularMs += r.regularMs;
      job.overtimeMs += r.overtimeMs;
      job.regularPay = addPay(job.regularPay, r.regularPay);
      job.overtimePay = addPay(job.overtimePay, r.overtimePay);
      job.pay = addPay(job.pay, r.pay);
    }
    return {
      dayKey,
      weekKey: dayShifts[0]?.weekKey ?? overtimeWeekKey(dayKey, settings.weekStartsOn),
      workedMs: dayShifts.reduce((sum, r) => sum + r.workedMs, 0),
      regularMs: dayShifts.reduce((sum, r) => sum + r.regularMs, 0),
      overtimeMs: dayShifts.reduce((sum, r) => sum + r.overtimeMs, 0),
      automaticBreakMs: dayAutoBreakMs.get(dayKey) ?? 0,
      incomplete: dayShifts.some((r) => r.incomplete),
      shiftIds: dayShifts.map((r) => r.id),
      jobs,
    };
  });

  return {
    shifts: shiftResults,
    days,
    totals: {
      workedMs: shiftResults.reduce((sum, r) => sum + r.workedMs, 0),
      regularMs: shiftResults.reduce((sum, r) => sum + r.regularMs, 0),
      overtimeMs: shiftResults.reduce((sum, r) => sum + r.overtimeMs, 0),
      pay: shiftResults.reduce((sum, r) => sum + (r.pay ?? 0), 0),
      missingRate: shiftResults.some((r) => r.pay === null && r.workedMs > 0),
      hasIncomplete: shiftResults.some((r) => r.incomplete),
    },
  };
}
