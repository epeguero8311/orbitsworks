import { httpsCallable } from "firebase/functions";
import { Timestamp } from "firebase/firestore";
import { functions } from "@/lib/firebase";

// Admin Permissions (Task 4, D2): the client side of the getShiftData server
// call (functions/src/shiftReads.ts). Hooks of an Admin limited to some
// sites load shift data through here instead of a Firestore query, and get
// back the SAME shape a query gives them ({ id, data() } docs with real
// Timestamps), so each page keeps one hook and one set of components.

export type ShiftDataPurpose = "shifts" | "export" | "analytics" | "overview";

export type ShiftDataRequest = {
  purpose: ShiftDataPurpose;
  startMs?: number;
  endMs?: number;
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  clockInEventIds?: string[];
  overrideEventIds?: string[];
  weekFromMs?: number;
  want: {
    clockEvents?: boolean;
    approvals?: boolean;
    siteExits?: boolean;
    shiftNotes?: boolean;
    overrideEvents?: boolean;
    tipEdits?: boolean;
    overtime?: boolean;
  };
};

// Same subset of a Firestore DocumentSnapshot the hooks use.
export type DocLike = { id: string; data: () => Record<string, unknown> };

// Rule 2 / D3: a visible shift's numbers computed from EVERY site
// (functions/src/shiftReads.ts overtimeForShifts). The OT fields are only
// there with Overtime ON.
export type ServerShiftOvertime = {
  overtimeMinutes?: number;
  dayKey?: string;
  dayWorkedMinutes?: number;
  dayOvertimeMinutes?: number;
  // Re-approve warning: approved OT vs what it would be now (same settings).
  overtimeChanged: { frozenMinutes: number; liveMinutes: number } | null;
  // Net worked minutes from weekFromMs through this shift, all sites.
  weekWorkedMinutesThrough: number;
};

export type ShiftDataResult = {
  clockEvents: DocLike[];
  approvals: DocLike[];
  siteExits: DocLike[];
  shiftNotes: DocLike[];
  overrideEvents: DocLike[];
  tipEdits: DocLike[];
  overtime: Record<string, ServerShiftOvertime>;
};

// { __ts: millis } (server) -> Timestamp, recursively.
export function reviveTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveTimestamps);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === "__ts" && typeof obj.__ts === "number") return Timestamp.fromMillis(obj.__ts);
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = reviveTimestamps(obj[k]);
    return out;
  }
  return value;
}

export function toDocs(raw: unknown): DocLike[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const { id, ...rest } = reviveTimestamps(r) as { id: string } & Record<string, unknown>;
    return { id, data: () => rest };
  });
}

export async function fetchShiftData(req: ShiftDataRequest): Promise<ShiftDataResult> {
  const fn = httpsCallable(functions, "getShiftData");
  const res = (await fn(req)).data as Record<string, unknown>;
  return {
    clockEvents: toDocs(res.clockEvents),
    approvals: toDocs(res.approvals),
    siteExits: toDocs(res.siteExits),
    shiftNotes: toDocs(res.shiftNotes),
    overrideEvents: toDocs(res.overrideEvents),
    tipEdits: toDocs(res.tipEdits),
    overtime: (res.overtime as Record<string, ServerShiftOvertime> | undefined) ?? {},
  };
}

// How often a server-loaded page refreshes (instead of a live listener).
export const SERVER_REFRESH_MS = 30_000;
