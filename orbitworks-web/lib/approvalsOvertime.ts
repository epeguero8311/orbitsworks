import { computeOvertime, type OvertimeSettings, type OvertimeShiftInput } from "@/lib/overtime";
import { pairReportShifts, type ReportClockEvent } from "@/lib/reportOvertime";

// Overtime (Task 1) step 8 - Approve Hours with the Overtime toggle ON.
// Pure (no Firebase). One call = one employee's loaded events (the whole
// week(s) around the visible range).
//
// Per shift it returns:
//  - breakMs / workedMs: Automatic Break once per day (decision 4), with an
//    approved shift's frozen Automatic Break.
//  - dayWorkedMs: the combined day total, for the Max hours flag
//    (decision 23).
//  - overtimeMs: the shift's OT (frozen if approved with overtimeApplied).
//  - overtimeChanged: on an APPROVED shift with frozen OT, the OT it would
//    have now with the SAME settings it was approved with. Different = an
//    edit to another (unapproved) day moved it -> re-approve warning
//    (rule 11). A settings change alone never triggers it.

export type ApprovalForOvertime = {
  status?: string;
  autoBreakMinutesApplied?: number;
  autoBreakMinShiftHoursApplied?: number;
  overtimeApplied?: {
    overtimeMinutes: number;
    settings?: {
      weeklyThresholdHours: number;
      dailyThresholdHours: number;
      weekStartsOn: number;
      multiplier: number;
      roundOvertimeMinutes: 0 | 5 | 15 | 30;
      timeZone: string;
    };
  };
};

export type ApprovalOvertimeInfo = {
  breakMs: number;
  workedMs: number;
  dayWorkedMs: number;
  overtimeMs: number;
  frozen: boolean;
  overtimeChanged: { frozenMinutes: number; liveMinutes: number } | null;
};

const MINUTE_MS = 60 * 1000;
const NO_RATES = () => ({ rate: null, overtimeRate: null });

export function computeApprovalsOvertime(
  events: ReportClockEvent[],
  approvals: Map<string, ApprovalForOvertime>,
  settings: OvertimeSettings
): Map<string, ApprovalOvertimeInfo> {
  const shifts = pairReportShifts(events);
  const baseInputs: OvertimeShiftInput[] = shifts.map((s) => {
    const a = approvals.get(s.id);
    const approved = a?.status === "approved";
    return {
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      breakMs: s.breakMs,
      jobId: null,
      ...(approved
        ? { autoBreak: { minutes: a?.autoBreakMinutesApplied ?? 0, minimumShiftHours: a?.autoBreakMinShiftHoursApplied ?? 0 } }
        : {}),
    };
  });
  const withFrozen = baseInputs.map((input) => {
    const a = approvals.get(input.id);
    const minutes = a?.status === "approved" ? a.overtimeApplied?.overtimeMinutes : undefined;
    return typeof minutes === "number" ? { ...input, frozenOvertimeMs: minutes * MINUTE_MS } : input;
  });

  const result = computeOvertime(withFrozen, settings, NO_RATES);
  const dayWorked = new Map(result.days.map((d) => [d.dayKey, d.workedMs]));

  // Live OT with each approved shift's own frozen settings (one run per
  // distinct snapshot - normally just one).
  const liveBySnapshot = new Map<string, Map<string, number>>();
  function liveOvertimeMs(snapshot: NonNullable<ApprovalForOvertime["overtimeApplied"]>["settings"], id: string): number | null {
    if (!snapshot) return null;
    const key = JSON.stringify(snapshot);
    let byId = liveBySnapshot.get(key);
    if (!byId) {
      const live = computeOvertime(
        baseInputs,
        {
          ...settings,
          enabled: true,
          weeklyThresholdHours: snapshot.weeklyThresholdHours,
          dailyThresholdHours: snapshot.dailyThresholdHours,
          weekStartsOn: snapshot.weekStartsOn,
          multiplier: snapshot.multiplier,
          roundOvertimeMinutes: snapshot.roundOvertimeMinutes,
          timeZone: snapshot.timeZone,
        },
        NO_RATES
      );
      byId = new Map(live.shifts.map((s) => [s.id, s.overtimeMs]));
      liveBySnapshot.set(key, byId);
    }
    return byId.get(id) ?? null;
  }

  const out = new Map<string, ApprovalOvertimeInfo>();
  for (const r of result.shifts) {
    const a = approvals.get(r.id);
    let overtimeChanged: ApprovalOvertimeInfo["overtimeChanged"] = null;
    if (a?.status === "approved" && a.overtimeApplied && typeof a.overtimeApplied.overtimeMinutes === "number") {
      const live = liveOvertimeMs(a.overtimeApplied.settings, r.id);
      if (live !== null) {
        const liveMinutes = Math.round(live / MINUTE_MS);
        if (Math.abs(liveMinutes - a.overtimeApplied.overtimeMinutes) >= 1) {
          overtimeChanged = { frozenMinutes: a.overtimeApplied.overtimeMinutes, liveMinutes };
        }
      }
    }
    out.set(r.id, {
      breakMs: r.breakMs,
      workedMs: r.workedMs,
      dayWorkedMs: dayWorked.get(r.dayKey) ?? r.workedMs,
      overtimeMs: r.overtimeMs,
      frozen: r.frozen,
      overtimeChanged,
    });
  }
  return out;
}
