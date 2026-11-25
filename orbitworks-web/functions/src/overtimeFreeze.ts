import * as admin from "firebase-admin";
import { db } from "./shared";
import type { MinimalClockEvent } from "./clockStatus";
import { computeOvertime, overtimeDayKey, overtimeWeekKey, type OvertimeShiftInput } from "./overtime";
import { companyOvertimeSettings, shiftsFromClockEvents } from "./overtimeShifts";

// Overtime (Task 1) step 8 - rule 11: OT is FROZEN on a shift the moment
// it's approved. setApprovalStatus / setApprovalStatusBulk call this and
// write the result onto timesheetApprovals/{clockInEventId}:
//
//   overtimeApplied: {
//     overtimeMinutes, dailyOvertimeMinutes, weeklyOvertimeMinutes,
//     workedMinutes,
//     jobId, rate, overtimeRate,      (decision 4B)
//     settings: { weeklyThresholdHours, dailyThresholdHours, weekStartsOn,
//                 multiplier, roundOvertimeMinutes, timeZone }
//   }
//
// Decision 4B: the shift's job rate and effective OT $/hr are frozen too,
// as the export would have priced it at that moment: the Approve Hours job
// (the one picked in this approval, else the one already on the doc), else
// the employee's default job; its current hourly rate, and its fixed
// Overtime rate else rate x multiplier (subcontractors: the straight rate);
// an employee without a title uses their own rate x multiplier.
//
// Reports/exports then use overtimeMinutes for that shift instead of
// recalculating, so a later settings change never moves it. The settings
// snapshot lets Approve Hours tell a DATA edit (re-approve warning) apart
// from a settings change. Back to pending, approving with Overtime OFF, or
// a shift with no clock-out clears it (null in the returned map - the
// caller writes FieldValue.delete() on an update, or nothing on a create).
//
// The week is computed live from every shift of the employee's week (the
// company's "Week starts on" + time zone), approved or not - one events
// query per employee+week, so a bulk approve of up to 500 rows never
// queries per row. Already-approved shifts keep their own frozen Automatic
// Break; the shifts being approved now use the live settings (the same
// values resolveAutoBreakFields stamps on them in this write).

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type ApprovalData = {
  status?: string;
  jobId?: string | null;
  autoBreakMinutesApplied?: number;
  autoBreakMinShiftHoursApplied?: number;
};

export async function resolveOvertimeFreezeFields(
  companyId: string,
  status: "pending" | "approved",
  eventIds: string[],
  // Job picked in THIS approval call per event (null = "(Default)"). An
  // event not in the map keeps the job already on its approval doc.
  jobIdOverrides: Map<string, string | null> = new Map()
): Promise<Map<string, Record<string, unknown> | null>> {
  const out = new Map<string, Record<string, unknown> | null>();
  eventIds.forEach((id) => out.set(id, null));
  if (status !== "approved" || eventIds.length === 0) return out;

  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  const ot = companyOvertimeSettings((companySnap.data() ?? {}) as Record<string, unknown>);
  if (!ot.enabled) return out;

  const eventsCol = companyRef.collection("clockEvents");
  const inSnaps = await db.getAll(...eventIds.map((id) => eventsCol.doc(id)));
  // employeeId|weekKey -> clock-in ids being approved
  const groups = new Map<string, { employeeId: string; weekKey: string; ids: string[] }>();
  for (const snap of inSnaps) {
    const data = snap.data();
    if (!data || data.type !== "in" || typeof data.employeeId !== "string") continue;
    const ts = (data.adjustedTimestamp ?? data.timestamp) as admin.firestore.Timestamp | undefined;
    if (!ts) continue;
    const weekKey = overtimeWeekKey(overtimeDayKey(ts.toMillis(), ot.timeZone), ot.weekStartsOn);
    const key = `${data.employeeId}|${weekKey}`;
    const group = groups.get(key) ?? { employeeId: data.employeeId, weekKey, ids: [] };
    group.ids.push(snap.id);
    groups.set(key, group);
  }

  const approving = new Set(eventIds);
  const multiplier = ot.multiplier;
  const jobsSnap = await companyRef.collection("jobs").get();
  const jobs = new Map(
    jobsSnap.docs.map((d) => {
      const j = d.data() as { hourlyRate?: number; overtimeRate?: number | null };
      return [d.id, { hourlyRate: typeof j.hourlyRate === "number" ? j.hourlyRate : null, overtimeRate: j.overtimeRate ?? null }];
    })
  );
  const snapshot = {
    weeklyThresholdHours: ot.weeklyThresholdHours,
    dailyThresholdHours: ot.dailyThresholdHours,
    weekStartsOn: ot.weekStartsOn,
    multiplier: ot.multiplier,
    roundOvertimeMinutes: ot.roundOvertimeMinutes,
    timeZone: ot.timeZone,
  };

  for (const group of groups.values()) {
    // The query runs on the raw timestamp; a day of margin each side covers
    // any US time zone and adjusted times near the edges.
    const weekStartMs = Date.parse(`${group.weekKey}T00:00:00Z`);
    const eventsSnap = await eventsCol
      .where("employeeId", "==", group.employeeId)
      .where("timestamp", ">=", admin.firestore.Timestamp.fromMillis(weekStartMs - DAY_MS))
      .where("timestamp", "<=", admin.firestore.Timestamp.fromMillis(weekStartMs + 8 * DAY_MS))
      .orderBy("timestamp", "asc")
      .get();
    const events: MinimalClockEvent[] = eventsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<MinimalClockEvent, "id">) }))
      .filter((e) => ["in", "out", "breakStart", "breakEnd"].includes(e.type));
    const shifts = shiftsFromClockEvents(events);

    // Frozen Automatic Break of the week's other already-approved shifts,
    // and the job already on each approving shift's doc.
    const approvalSnaps =
      shifts.length > 0 ? await db.getAll(...shifts.map((s) => companyRef.collection("timesheetApprovals").doc(s.id))) : [];
    const frozenAutoBreak = new Map<string, { minutes: number; minimumShiftHours: number }>();
    const docJobId = new Map<string, string | null>();
    approvalSnaps.forEach((snap) => {
      const a = snap.data() as ApprovalData | undefined;
      docJobId.set(snap.id, a?.jobId ?? null);
      if (approving.has(snap.id)) return;
      if (a?.status === "approved") {
        frozenAutoBreak.set(snap.id, {
          minutes: a.autoBreakMinutesApplied ?? 0,
          minimumShiftHours: a.autoBreakMinShiftHoursApplied ?? 0,
        });
      }
    });
    const inputs: OvertimeShiftInput[] = shifts.map((s) => {
      const ab = frozenAutoBreak.get(s.id);
      return ab ? { ...s, autoBreak: ab } : s;
    });

    const empSnap = await companyRef.collection("employees").doc(group.employeeId).get();
    const emp = (empSnap.data() ?? {}) as { jobId?: string | null; hourlyRate?: number | null; subcontractorId?: string | null };
    const isSubcontractor = !!emp.subcontractorId;

    const result = computeOvertime(inputs, ot, () => ({ rate: null, overtimeRate: null }));
    for (const id of group.ids) {
      const r = result.shifts.find((s) => s.id === id);
      if (!r || r.incomplete) continue;
      const picked = jobIdOverrides.has(id) ? jobIdOverrides.get(id) ?? null : docJobId.get(id) ?? null;
      const jobId = picked && jobs.has(picked) ? picked : emp.jobId && jobs.has(emp.jobId) ? emp.jobId : null;
      const job = jobId ? jobs.get(jobId) : undefined;
      const rate = job ? job.hourlyRate : typeof emp.hourlyRate === "number" ? emp.hourlyRate : null;
      const overtimeRate =
        rate === null ? null : isSubcontractor ? rate : job?.overtimeRate ?? rate * multiplier;
      out.set(id, {
        overtimeApplied: {
          overtimeMinutes: Math.round(r.overtimeMs / MINUTE_MS),
          dailyOvertimeMinutes: Math.round(r.dailyOvertimeMs / MINUTE_MS),
          weeklyOvertimeMinutes: Math.round(r.weeklyOvertimeMs / MINUTE_MS),
          workedMinutes: Math.round(r.workedMs / MINUTE_MS),
          jobId,
          rate,
          overtimeRate,
          settings: snapshot,
        },
      });
    }
  }
  return out;
}
