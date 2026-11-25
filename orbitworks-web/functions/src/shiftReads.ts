import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { db } from "./shared";
import { canAccessSite, hasAllSites, type AdminAccess } from "./adminAccessModel";
import { loadAdminCaller, requirePermission } from "./adminAccess";
import type { MinimalClockEvent } from "./clockStatus";
import { computeOvertime, overtimeDayKey, overtimeWeekKey, type OvertimeShiftInput } from "./overtime";
import { companyOvertimeSettings, shiftsFromClockEvents } from "./overtimeShifts";

// Admin Permissions (Task 4, D2-D4, D13): the server read path for admins
// the rules block from reading shift data directly (an Admin limited to some
// sites). The website's hooks turn the result back into the same shapes a
// Firestore query gives them, so each page keeps ONE hook (D2 requirement).
//
// purpose:
//  - "shifts":    only shifts on the caller's sites (rule 1: by the SHIFT's
//                 site = its clock-in's / approval's site), plus each visible
//                 shift's OT and its employee-day's FULL worked + OT totals,
//                 computed here from every site (rule 2 / D3) - plain
//                 numbers, no other sites' shift details.
//  - "export":    everything (rule 3 / D4) - needs Export payroll.
//  - "analytics": everything (rule 5) - needs Analytics.
//  - "overview":  everything, last ~8 days only (rule 5 / D13).
// Timestamps travel as { __ts: millis } and are rebuilt on the client.

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MAX_RANGE_MS = 400 * DAY_MS;
const PAIRING_BUFFER_MS = 2 * DAY_MS;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  purpose: z.enum(["shifts", "export", "analytics", "overview"]),
  startMs: z.number().int().optional(),
  endMs: z.number().int().optional(),
  startDate: z.string().regex(DATE_KEY).optional(),
  endDate: z.string().regex(DATE_KEY).optional(),
  employeeId: z.string().trim().min(1).max(200).optional(),
  // By-shift lookups (Session review): these clock-ins' approvals, site
  // exits, notes and tip history.
  clockInEventIds: z.array(z.string().trim().min(1).max(200)).max(300).optional(),
  want: z
    .object({
      clockEvents: z.boolean().optional(),
      approvals: z.boolean().optional(),
      siteExits: z.boolean().optional(),
      shiftNotes: z.boolean().optional(),
      overrideEvents: z.boolean().optional(),
      tipEdits: z.boolean().optional(),
      overtime: z.boolean().optional(),
    })
    .default({}),
});

type Doc = { id: string; [k: string]: unknown };

// Firestore values -> JSON (Timestamps as { __ts }), recursively.
function serialize(value: unknown): unknown {
  if (value instanceof admin.firestore.Timestamp) return { __ts: value.toMillis() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialize(v);
    return out;
  }
  return value;
}
const docOut = (d: FirebaseFirestore.DocumentSnapshot): Doc => ({ id: d.id, ...(serialize(d.data() ?? {}) as Record<string, unknown>) });

function effectiveMs(data: FirebaseFirestore.DocumentData): number {
  const ts = (data.adjustedTimestamp ?? data.timestamp) as admin.firestore.Timestamp | undefined;
  return ts ? ts.toMillis() : 0;
}

async function getAllDocs(refs: FirebaseFirestore.DocumentReference[]): Promise<FirebaseFirestore.DocumentSnapshot[]> {
  const out: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += 100) {
    if (refs.slice(i, i + 100).length) out.push(...(await db.getAll(...refs.slice(i, i + 100))));
  }
  return out;
}

export const getShiftData = onCall(async (request) => {
  const caller = await loadAdminCaller(request);
  const parsed = schema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid request.");
  const input = parsed.data;
  const want = input.want;

  if (input.purpose === "export") requirePermission(caller, "exportPayroll");
  if (input.purpose === "analytics") requirePermission(caller, "analytics");
  const seesAll = input.purpose !== "shifts" || hasAllSites(caller.access);

  let startMs = input.startMs ?? 0;
  let endMs = input.endMs ?? 0;
  if (input.purpose === "overview") {
    // D13: Overview is unfiltered, but only ever the recent window it shows.
    const now = Date.now();
    startMs = Math.max(startMs, now - 8 * DAY_MS);
    endMs = Math.min(endMs || now + DAY_MS, now + DAY_MS);
    // A range entirely before the window = nothing to show (not an error).
    if (endMs < startMs) endMs = startMs;
  }
  const hasRange = input.startMs !== undefined && input.endMs !== undefined;
  if (hasRange && (endMs < startMs || endMs - startMs > MAX_RANGE_MS)) {
    throw new HttpsError("invalid-argument", "Pick a shorter date range.");
  }

  const companyRef = db.collection("companies").doc(caller.companyId);
  const eventsCol = companyRef.collection("clockEvents");
  const approvalsCol = companyRef.collection("timesheetApprovals");

  // ---- session site resolution (rule 1) ----
  const sessionSite = new Map<string, string | null>(); // clockInId -> site
  async function resolveSessionSites(clockInIds: string[]): Promise<void> {
    const missing = [...new Set(clockInIds)].filter((id) => !sessionSite.has(id));
    if (!missing.length) return;
    const approvals = await getAllDocs(missing.map((id) => approvalsCol.doc(id)));
    const noApproval: string[] = [];
    approvals.forEach((snap, i) => {
      if (snap.exists) sessionSite.set(missing[i], (snap.data()?.siteId as string | null | undefined) ?? null);
      else noApproval.push(missing[i]);
    });
    const ins = await getAllDocs(noApproval.map((id) => eventsCol.doc(id)));
    ins.forEach((snap, i) => sessionSite.set(noApproval[i], snap.exists ? ((snap.data()?.siteId as string | null | undefined) ?? null) : null));
  }
  const canSee = (clockInId: string | null | undefined, fallbackSiteId?: string | null): boolean => {
    if (seesAll) return true;
    if (clockInId && sessionSite.has(clockInId)) return canAccessSite(caller.access as AdminAccess, sessionSite.get(clockInId));
    if (clockInId) return false;
    return canAccessSite(caller.access as AdminAccess, fallbackSiteId ?? null);
  };

  const out: Record<string, unknown> = {};

  // ---- clock events in range, each tied to its session's clock-in ----
  let visibleClockIns: string[] = [];
  if (want.clockEvents && hasRange) {
    let q: FirebaseFirestore.Query = eventsCol
      .where("timestamp", ">=", admin.firestore.Timestamp.fromMillis(startMs - PAIRING_BUFFER_MS))
      .where("timestamp", "<=", admin.firestore.Timestamp.fromMillis(endMs));
    if (input.employeeId) q = eventsCol.where("employeeId", "==", input.employeeId)
      .where("timestamp", ">=", admin.firestore.Timestamp.fromMillis(startMs - PAIRING_BUFFER_MS))
      .where("timestamp", "<=", admin.firestore.Timestamp.fromMillis(endMs));
    const snap = await q.orderBy("timestamp", "asc").get();
    const byEmployee = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    for (const d of snap.docs) {
      const emp = String(d.data().employeeId ?? "");
      const list = byEmployee.get(emp) ?? [];
      list.push(d);
      byEmployee.set(emp, list);
    }
    const sessionOf = new Map<string, string | null>(); // eventId -> clockInId
    for (const list of byEmployee.values()) {
      list.sort((a, b) => effectiveMs(a.data()) - effectiveMs(b.data()));
      let open: string | null = null;
      for (const d of list) {
        const type = d.data().type;
        if (type === "in") open = d.id;
        sessionOf.set(d.id, open);
        if (type === "out") open = null;
      }
    }
    await resolveSessionSites([...new Set([...sessionOf.values()].filter((v): v is string => !!v))]);
    const inRange = snap.docs.filter((d) => {
      const ms = (d.data().timestamp as admin.firestore.Timestamp).toMillis();
      return ms >= startMs && ms <= endMs;
    });
    // Restricted: only events of a known session on one of their sites.
    const visible = inRange.filter((d) => {
      const clockInId = sessionOf.get(d.id) ?? null;
      return seesAll || (!!clockInId && canSee(clockInId));
    });
    out.clockEvents = visible.map(docOut);
    visibleClockIns = [...new Set(visible.map((d) => sessionOf.get(d.id)).filter((v): v is string => !!v))];
  }

  // ---- approvals (by date range, or by clock-in ids) ----
  if (want.approvals) {
    let docs: FirebaseFirestore.DocumentSnapshot[] = [];
    if (input.clockInEventIds) {
      docs = (await getAllDocs(input.clockInEventIds.map((id) => approvalsCol.doc(id)))).filter((d) => d.exists);
    } else if (input.startDate && input.endDate) {
      let q: FirebaseFirestore.Query = approvalsCol.where("date", ">=", input.startDate).where("date", "<=", input.endDate);
      if (input.employeeId) q = approvalsCol.where("employeeId", "==", input.employeeId).where("date", ">=", input.startDate).where("date", "<=", input.endDate);
      docs = (await q.get()).docs;
    }
    docs.forEach((d) => sessionSite.set(d.id, (d.data()?.siteId as string | null | undefined) ?? null));
    out.approvals = docs.filter((d) => canSee(d.id)).map(docOut);
  }

  // ---- site exits ----
  if (want.siteExits) {
    let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    const col = companyRef.collection("siteExits");
    if (input.clockInEventIds) {
      for (let i = 0; i < input.clockInEventIds.length; i += 30) {
        docs.push(...(await col.where("clockInEventId", "in", input.clockInEventIds.slice(i, i + 30)).get()).docs);
      }
    } else if (hasRange) {
      docs = (await col.where("startMs", ">=", startMs).where("startMs", "<=", endMs).orderBy("startMs", "asc").get()).docs;
    }
    await resolveSessionSites(docs.map((d) => String(d.data().clockInEventId ?? "")).filter(Boolean));
    out.siteExits = docs.filter((d) => canSee(d.data().clockInEventId as string | undefined, d.data().siteId as string | null)).map(docOut);
  }

  // ---- shift notes (employee comments tie to a shift; site notes to a site) ----
  if (want.shiftNotes) {
    let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    const col = companyRef.collection("shiftNotes");
    if (input.clockInEventIds) {
      for (let i = 0; i < input.clockInEventIds.length; i += 30) {
        docs.push(...(await col.where("clockEventId", "in", input.clockInEventIds.slice(i, i + 30)).get()).docs);
      }
    } else if (hasRange) {
      docs = (
        await col
          .where("timestamp", ">=", admin.firestore.Timestamp.fromMillis(startMs))
          .where("timestamp", "<=", admin.firestore.Timestamp.fromMillis(endMs))
          .orderBy("timestamp", "asc")
          .get()
      ).docs;
    }
    await resolveSessionSites(docs.map((d) => String(d.data().clockEventId ?? "")).filter(Boolean));
    out.shiftNotes = docs.filter((d) => canSee(d.data().clockEventId as string | undefined, d.data().siteId as string | null)).map(docOut);
  }

  // ---- override events (Session review's override detail) ----
  if (want.overrideEvents && input.clockInEventIds) {
    const approvals = await getAllDocs(input.clockInEventIds.map((id) => approvalsCol.doc(id)));
    const ids = new Set<string>();
    approvals.forEach((a) => {
      if (!a.exists || !canSee(a.id)) return;
      for (const f of (a.data()?.flags as Array<{ overrideEventId?: string }> | undefined) ?? []) if (f.overrideEventId) ids.add(f.overrideEventId);
    });
    const docs = await getAllDocs([...ids].map((id) => companyRef.collection("overrideEvents").doc(id)));
    out.overrideEvents = docs.filter((d) => d.exists).map(docOut);
  }

  // ---- tip history of one visible shift ----
  if (want.tipEdits && input.clockInEventIds?.length === 1) {
    const id = input.clockInEventIds[0];
    await resolveSessionSites([id]);
    out.tipEdits = canSee(id) ? (await approvalsCol.doc(id).collection("tipEdits").orderBy("editedAt", "desc").get()).docs.map(docOut) : [];
  }

  // ---- rule 2 / D3: OT + full day totals of the visible shifts ----
  if (want.overtime && !seesAll && visibleClockIns.length) {
    out.overtime = await overtimeForShifts(caller.companyId, visibleClockIns);
  }

  return out;
});

// Per visible clock-in: its OT and its employee-day's FULL worked + OT (all
// sites), computed live from every shift of the employee's week with the
// shared overtime function. Approved shifts keep their frozen OT (rule 11).
// Only numbers come back - never another site's shift details.
async function overtimeForShifts(
  companyId: string,
  clockInIds: string[]
): Promise<Record<string, { overtimeMinutes: number; dayKey: string; dayWorkedMinutes: number; dayOvertimeMinutes: number }>> {
  const companyRef = db.collection("companies").doc(companyId);
  const ot = companyOvertimeSettings(((await companyRef.get()).data() ?? {}) as Record<string, unknown>);
  const result: Record<string, { overtimeMinutes: number; dayKey: string; dayWorkedMinutes: number; dayOvertimeMinutes: number }> = {};
  if (!ot.enabled) return result;
  const eventsCol = companyRef.collection("clockEvents");
  const ins = await getAllDocs(clockInIds.map((id) => eventsCol.doc(id)));
  const groups = new Map<string, { employeeId: string; weekKey: string; ids: string[] }>();
  for (const snap of ins) {
    const d = snap.data();
    if (!d || d.type !== "in" || typeof d.employeeId !== "string") continue;
    const weekKey = overtimeWeekKey(overtimeDayKey(effectiveMs(d), ot.timeZone), ot.weekStartsOn);
    const key = `${d.employeeId}|${weekKey}`;
    const g = groups.get(key) ?? { employeeId: d.employeeId, weekKey, ids: [] };
    g.ids.push(snap.id);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const weekStartMs = Date.parse(`${g.weekKey}T00:00:00Z`);
    const evSnap = await eventsCol
      .where("employeeId", "==", g.employeeId)
      .where("timestamp", ">=", admin.firestore.Timestamp.fromMillis(weekStartMs - DAY_MS))
      .where("timestamp", "<=", admin.firestore.Timestamp.fromMillis(weekStartMs + 8 * DAY_MS))
      .orderBy("timestamp", "asc")
      .get();
    const events: MinimalClockEvent[] = evSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<MinimalClockEvent, "id">) }))
      .filter((e) => ["in", "out", "breakStart", "breakEnd"].includes(e.type));
    const shifts = shiftsFromClockEvents(events);
    const approvals = await getAllDocs(shifts.map((s) => companyRef.collection("timesheetApprovals").doc(s.id)));
    const inputs: OvertimeShiftInput[] = shifts.map((s, i) => {
      const a = approvals[i]?.data() as
        | { status?: string; autoBreakMinutesApplied?: number; autoBreakMinShiftHoursApplied?: number; overtimeApplied?: { overtimeMinutes?: number } }
        | undefined;
      if (a?.status !== "approved") return s;
      return {
        ...s,
        autoBreak: { minutes: a.autoBreakMinutesApplied ?? 0, minimumShiftHours: a.autoBreakMinShiftHoursApplied ?? 0 },
        ...(typeof a.overtimeApplied?.overtimeMinutes === "number" ? { frozenOvertimeMs: a.overtimeApplied.overtimeMinutes * MINUTE_MS } : {}),
      };
    });
    const r = computeOvertime(inputs, ot, () => ({ rate: null, overtimeRate: null }));
    for (const id of g.ids) {
      const s = r.shifts.find((x) => x.id === id);
      if (!s) continue;
      const day = r.days.find((x) => x.dayKey === s.dayKey);
      result[id] = {
        overtimeMinutes: Math.round(s.overtimeMs / MINUTE_MS),
        dayKey: s.dayKey,
        dayWorkedMinutes: Math.round((day?.workedMs ?? 0) / MINUTE_MS),
        dayOvertimeMinutes: Math.round((day?.overtimeMs ?? 0) / MINUTE_MS),
      };
    }
  }
  return result;
}
