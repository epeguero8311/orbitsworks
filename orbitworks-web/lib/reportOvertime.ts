import { computeOvertime, type OvertimeSettings, type OvertimeShiftInput } from "@/lib/overtime";
import { ceilTo } from "@/lib/utils/rounding";
import type { Job, RoundingIncrement } from "@/lib/types";

// Overtime (Task 1) step 5 - Reports / exports when the company's Overtime
// toggle is ON. Pure (no Firebase), built on the shared computeOvertime.
// With Overtime OFF none of this runs: the Reports page and every export
// keep using reportComputations.ts / reportDailyBreakdown.ts unchanged.
//
// Rows:
//  - "single": a day with one job (the usual case) - one row, the Job can
//    still be changed for the report like today (Reports dropdown, Excel
//    Job dropdown).
//  - "job" + "total": a day with 2+ jobs splits into one row per job plus a
//    day total row. Those job rows are locked (no dropdown).
// The job per shift is the Approve Hours job, else the employee's default
// job (decision 6). Daily worked rounding (existing setting) still applies
// to the day's worked hours; the extra rounded minutes are regular time on
// the day's last-worked job.

const MINUTE_MS = 60 * 1000;

export type ReportClockEvent = {
  id: string;
  employeeId: string;
  type: string;
  // Effective (adjusted if corrected) time.
  ms: number;
};

export type ReportShift = {
  id: string; // clock-in event id
  employeeId: string;
  startMs: number;
  endMs: number | null;
  breakMs: number; // real tracked break time
};

// Pairs clock events into shifts exactly like computePayrollAndSessions
// (reportComputations.ts): a second "in" before an "out" leaves the first
// shift open; a non-positive in->out duration is dropped; break pairs only
// count inside a shift.
export function pairReportShifts(events: ReportClockEvent[]): ReportShift[] {
  const byEmployee = new Map<string, ReportClockEvent[]>();
  for (const e of events) {
    const list = byEmployee.get(e.employeeId);
    if (list) list.push(e);
    else byEmployee.set(e.employeeId, [e]);
  }
  const out: ReportShift[] = [];
  for (const [employeeId, list] of byEmployee) {
    const sorted = [...list].sort((a, b) => a.ms - b.ms);
    let pendingIn: ReportClockEvent | null = null;
    let openBreakStart: number | null = null;
    let breakMs = 0;
    for (const e of sorted) {
      if (e.type === "in") {
        if (pendingIn) out.push({ id: pendingIn.id, employeeId, startMs: pendingIn.ms, endMs: null, breakMs });
        pendingIn = e;
        openBreakStart = null;
        breakMs = 0;
      } else if (e.type === "breakStart") {
        if (pendingIn && openBreakStart === null) openBreakStart = e.ms;
      } else if (e.type === "breakEnd") {
        if (openBreakStart !== null) {
          if (e.ms - openBreakStart > 0) breakMs += e.ms - openBreakStart;
          openBreakStart = null;
        }
      } else if (e.type === "out" && pendingIn) {
        if (e.ms - pendingIn.ms > 0) {
          out.push({ id: pendingIn.id, employeeId, startMs: pendingIn.ms, endMs: e.ms, breakMs });
        }
        pendingIn = null;
        openBreakStart = null;
        breakMs = 0;
      }
    }
    if (pendingIn) out.push({ id: pendingIn.id, employeeId, startMs: pendingIn.ms, endMs: null, breakMs });
  }
  return out;
}

export type ReportEmployee = {
  name: string;
  defaultJobId: string | null;
  // The employee's own typed rate (used when they have no title).
  customRate: number | null;
  isSubcontractor: boolean;
  subcontractorName: string | null;
};

export type OvertimeReportRow = {
  key: string;
  employeeId: string;
  employeeName: string;
  subcontractorName: string | null;
  isSubcontractor: boolean;
  date: string;
  kind: "single" | "job" | "total";
  jobId: string | null;
  jobLabel: string;
  rate: number | null;
  overtimeRate: number | null;
  // The employee's default job rate / OT rate - what "(Default)" means in
  // the Excel Job dropdown.
  defaultRate: number | null;
  defaultOvertimeRate: number | null;
  clockedMinutes: number;
  breakMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  pay: number | null;
  // A shift that day has no clock-out (counted as 0, never assumed).
  incomplete: boolean;
  // Decision 4B: rate / overtimeRate are the ones frozen at approval.
  ratesFrozen: boolean;
  // Report-only Job override on a single-job day ("" = none).
  overrideJobId: string;
};

// OT $/hr: the job's fixed Overtime rate, else rate x multiplier;
// subcontractors get their straight rate (no premium).
export function effectiveOvertimeRate(
  rate: number | null,
  fixedOvertimeRate: number | null | undefined,
  multiplier: number,
  isSubcontractor: boolean
): number | null {
  if (rate === null) return null;
  if (isSubcontractor) return rate;
  return fixedOvertimeRate ?? rate * multiplier;
}

function rowPay(rate: number | null, overtimeRate: number | null, workedMinutes: number, overtimeMinutes: number): number | null {
  if (rate === null || overtimeRate === null) return null;
  return ((workedMinutes - overtimeMinutes) / 60) * rate + (overtimeMinutes / 60) * overtimeRate;
}

export function buildOvertimeReportRows(params: {
  shifts: ReportShift[];
  employees: Map<string, ReportEmployee>;
  jobs: Map<string, Job>;
  jobIdByClockInId: Map<string, string | null>;
  autoBreakByClockInId: Map<string, { minutes: number; minShiftHours: number }>;
  settings: OvertimeSettings;
  roundDailyMinutes: RoundingIncrement;
  startDate: string;
  endDate: string;
  // Rule 11: OT minutes frozen on approved sessions (overtimeApplied).
  frozenOvertimeMinutesByClockInId?: Map<string, number>;
  // Decision 4B: rate + effective OT $/hr frozen on approved sessions.
  frozenRatesByClockInId?: Map<string, { rate: number; overtimeRate: number | null }>;
}): OvertimeReportRow[] {
  const { shifts, employees, jobs, jobIdByClockInId, autoBreakByClockInId, settings, roundDailyMinutes, startDate, endDate } = params;
  const frozenOvertime = params.frozenOvertimeMinutesByClockInId ?? new Map<string, number>();
  const frozenRates = params.frozenRatesByClockInId ?? new Map<string, { rate: number; overtimeRate: number | null }>();

  const shiftsByEmployee = new Map<string, ReportShift[]>();
  for (const s of shifts) {
    const list = shiftsByEmployee.get(s.employeeId);
    if (list) list.push(s);
    else shiftsByEmployee.set(s.employeeId, [s]);
  }

  const rows: OvertimeReportRow[] = [];
  for (const [employeeId, empShifts] of shiftsByEmployee) {
    const emp = employees.get(employeeId);
    if (!emp) continue;
    const defaultJob = emp.defaultJobId ? jobs.get(emp.defaultJobId) ?? null : null;
    const defaultRate = defaultJob ? defaultJob.hourlyRate : emp.customRate;
    const defaultOvertimeRate = effectiveOvertimeRate(defaultRate, defaultJob?.overtimeRate, settings.multiplier, emp.isSubcontractor);

    const resolveJob = (clockInId: string): string | null => {
      const approved = jobIdByClockInId.get(clockInId);
      if (approved && jobs.has(approved)) return approved;
      return defaultJob ? defaultJob.id : null;
    };
    const inputs: OvertimeShiftInput[] = empShifts.map((s) => {
      const frozen = autoBreakByClockInId.get(s.id);
      const frozenOt = frozenOvertime.get(s.id);
      const frozenRate = frozenRates.get(s.id);
      return {
        id: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
        breakMs: s.breakMs,
        jobId: resolveJob(s.id),
        ...(frozen ? { autoBreak: { minutes: frozen.minutes, minimumShiftHours: frozen.minShiftHours } } : {}),
        ...(frozenOt !== undefined ? { frozenOvertimeMs: frozenOt * MINUTE_MS } : {}),
        ...(frozenRate ? { frozenRates: frozenRate } : {}),
      };
    });
    const result = computeOvertime(
      inputs,
      settings,
      (jobId) => {
        const job = jobId ? jobs.get(jobId) : undefined;
        return job
          ? { rate: job.hourlyRate, overtimeRate: job.overtimeRate ?? null }
          : { rate: emp.customRate, overtimeRate: null };
      },
      { noOvertimePremium: emp.isSubcontractor }
    );

    for (const day of result.days) {
      if (day.dayKey < startDate || day.dayKey > endDate) continue;
      const dayShifts = result.shifts.filter((s) => s.dayKey === day.dayKey);

      // One part per job AND rate pair, so a frozen-rate shift never
      // gets priced at another shift's rate (decision 4B).
      type JobPart = {
        key: string;
        ratesFrozen: boolean;
        jobId: string | null;
        clocked: number;
        brk: number;
        worked: number;
        ot: number;
        rate: number | null;
        overtimeRate: number | null;
      };
      const parts: JobPart[] = [];
      for (const s of dayShifts) {
        const partKey = `${s.jobId ?? ""}|${s.rate}|${s.overtimeRate}`;
        let part = parts.find((p) => p.key === partKey);
        if (!part) {
          part = { key: partKey, ratesFrozen: frozenRates.has(s.id), jobId: s.jobId, clocked: 0, brk: 0, worked: 0, ot: 0, rate: s.rate, overtimeRate: s.overtimeRate };
          parts.push(part);
        }
        part.clocked += s.grossMs;
        part.brk += s.breakMs;
        part.ot += s.overtimeMs;
      }
      for (const p of parts) {
        p.clocked = Math.round(p.clocked / MINUTE_MS);
        p.brk = Math.round(p.brk / MINUTE_MS);
        p.worked = Math.max(0, p.clocked - p.brk);
        p.ot = Math.min(p.worked, Math.round(p.ot / MINUTE_MS));
      }
      const dayWorked = parts.reduce((sum, p) => sum + p.worked, 0);
      if (dayWorked <= 0 && !day.incomplete) continue;
      // Existing "Round daily worked hours": the extra minutes are regular
      // time on the day's last-worked job.
      const extra = ceilTo(dayWorked, roundDailyMinutes) - dayWorked;
      const lastShift = dayShifts[dayShifts.length - 1];
      const lastPart =
        parts.find((p) => lastShift && p.key === `${lastShift.jobId ?? ""}|${lastShift.rate}|${lastShift.overtimeRate}`) ??
        parts[parts.length - 1];
      if (extra > 0 && lastPart) lastPart.worked += extra;

      const labelFor = (jobId: string | null) => (jobId ? jobs.get(jobId)?.name ?? "Default" : "Default");
      const base = {
        employeeId,
        employeeName: emp.name,
        subcontractorName: emp.subcontractorName,
        isSubcontractor: emp.isSubcontractor,
        date: day.dayKey,
        defaultRate,
        defaultOvertimeRate,
        incomplete: day.incomplete,
        overrideJobId: "",
      };

      if (parts.length <= 1) {
        const p = parts[0] ?? { key: "", ratesFrozen: false, jobId: defaultJob ? defaultJob.id : null, clocked: 0, brk: 0, worked: 0, ot: 0, rate: defaultRate, overtimeRate: defaultOvertimeRate };
        rows.push({
          ...base,
          key: `${employeeId}__${day.dayKey}`,
          kind: "single",
          ratesFrozen: p.ratesFrozen,
          jobId: p.jobId,
          jobLabel: labelFor(p.jobId),
          rate: p.rate,
          overtimeRate: p.overtimeRate,
          clockedMinutes: p.clocked,
          breakMinutes: p.brk,
          workedMinutes: p.worked,
          overtimeMinutes: p.ot,
          pay: rowPay(p.rate, p.overtimeRate, p.worked, p.ot),
        });
        continue;
      }

      let totalPay: number | null = 0;
      parts.forEach((p, i) => {
        const pay = rowPay(p.rate, p.overtimeRate, p.worked, p.ot);
        totalPay = totalPay === null || pay === null ? null : totalPay + pay;
        rows.push({
          ...base,
          key: `${employeeId}__${day.dayKey}__${p.jobId ?? "default"}${i > 0 && parts.slice(0, i).some((q) => q.jobId === p.jobId) ? `-${i}` : ""}`,
          kind: "job",
          ratesFrozen: p.ratesFrozen,
          jobId: p.jobId,
          jobLabel: labelFor(p.jobId),
          rate: p.rate,
          overtimeRate: p.overtimeRate,
          clockedMinutes: p.clocked,
          breakMinutes: p.brk,
          workedMinutes: p.worked,
          overtimeMinutes: p.ot,
          pay,
        });
      });
      rows.push({
        ...base,
        key: `${employeeId}__${day.dayKey}__total`,
        kind: "total",
        ratesFrozen: false,
        jobId: null,
        jobLabel: "Day total",
        rate: null,
        overtimeRate: null,
        clockedMinutes: parts.reduce((sum, p) => sum + p.clocked, 0),
        breakMinutes: parts.reduce((sum, p) => sum + p.brk, 0),
        workedMinutes: parts.reduce((sum, p) => sum + p.worked, 0),
        overtimeMinutes: parts.reduce((sum, p) => sum + p.ot, 0),
        pay: totalPay,
      });
    }
  }

  const kindOrder = { single: 0, job: 0, total: 1 };
  rows.sort((a, b) =>
    a.employeeName !== b.employeeName
      ? a.employeeName.localeCompare(b.employeeName)
      : a.date !== b.date
        ? (a.date < b.date ? -1 : 1)
        : kindOrder[a.kind] - kindOrder[b.kind]
  );
  return rows;
}

// Report-only Job overrides (Reports page Daily breakdown dropdown), keyed
// "employeeId__date". Only single-job days can be overridden - the job rows
// of a 2+ job day are locked. OT hours never change with the job; only the
// rate and OT rate do.
export function applyOvertimeOverrides(
  rows: OvertimeReportRow[],
  overrides: Record<string, string>,
  jobs: Job[],
  multiplier: number
): OvertimeReportRow[] {
  return rows.map((row) => {
    if (row.kind !== "single") return row;
    const jobId = overrides[row.key];
    const job = jobId ? jobs.find((j) => j.id === jobId) : undefined;
    if (!job) return row;
    const rate = job.hourlyRate;
    const overtimeRate = effectiveOvertimeRate(rate, job.overtimeRate, multiplier, row.isSubcontractor);
    return {
      ...row,
      jobId: job.id,
      jobLabel: job.name,
      rate,
      overtimeRate,
      ratesFrozen: false,
      overrideJobId: job.id,
      pay: rowPay(rate, overtimeRate, row.workedMinutes, row.overtimeMinutes),
    };
  });
}

export type OvertimeEmployeeTotal = {
  // Shift Hours / Break for the period, from the same day rows.
  totalShiftMinutes: number;
  totalBreakMinutes: number;
  totalWorkedMinutes: number;
  totalOvertimeMinutes: number;
  totalPay: number | null;
};

// Per employee: single rows + day total rows (never the job rows, which the
// total already covers). Total rounding (existing setting) works like
// today: the summed worked minutes are rounded once more and the extra
// minutes are paid at the employee's default rate. Summary Overtime = the
// sum of every day's OT (daily + weekly) in the period.
export function computeOvertimeTotals(
  rows: OvertimeReportRow[],
  roundTotalMinutes: RoundingIncrement
): Map<string, OvertimeEmployeeTotal> {
  const acc = new Map<string, { shift: number; brk: number; worked: number; ot: number; pay: number | null; defaultRate: number | null }>();
  for (const row of rows) {
    if (row.kind === "job") continue;
    const a = acc.get(row.employeeId) ?? { shift: 0, brk: 0, worked: 0, ot: 0, pay: null, defaultRate: row.defaultRate };
    a.shift += row.clockedMinutes;
    a.brk += row.breakMinutes;
    a.worked += row.workedMinutes;
    a.ot += row.overtimeMinutes;
    if (row.pay !== null) a.pay = (a.pay ?? 0) + row.pay;
    acc.set(row.employeeId, a);
  }
  const totals = new Map<string, OvertimeEmployeeTotal>();
  for (const [employeeId, a] of acc) {
    const totalWorkedMinutes = ceilTo(a.worked, roundTotalMinutes);
    const extra = totalWorkedMinutes - a.worked;
    totals.set(employeeId, {
      totalShiftMinutes: a.shift,
      totalBreakMinutes: a.brk,
      totalWorkedMinutes,
      totalOvertimeMinutes: a.ot,
      totalPay: a.pay !== null && a.defaultRate !== null ? a.pay + (extra / 60) * a.defaultRate : a.pay,
    });
  }
  return totals;
}
