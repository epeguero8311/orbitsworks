import { z } from "zod";
import { CORRECTION_REASON_MAX } from "./clockCorrectionValidators";

// ---- reassignClockSession (Timesheet Approvals > Session review) ----
//
// Input mirrored on the website as ReassignClockSessionInput (lib/types.ts).
// Pure helpers below so the session walk and the overlap check can be
// tested without Firestore.

export const reassignClockSessionSchema = z.object({
  clockInEventId: z.string().trim().min(1, "clockInEventId is required.").max(200),
  newEmployeeId: z.string().trim().min(1, "newEmployeeId is required.").max(200),
  reason: z
    .string()
    .trim()
    .max(CORRECTION_REASON_MAX, `Keep the reason under ${CORRECTION_REASON_MAX} characters.`)
    .optional()
    .transform((r) => (r ? r : undefined)),
});

export type ReassignClockSessionInput = z.infer<typeof reassignClockSessionSchema>;

// One clock event reduced to what the walk needs. ms = EFFECTIVE time
// (adjustedTimestamp ?? timestamp).
export interface SessionEvent {
  id: string;
  type: string;
  ms: number;
}

export type CollectSessionResult =
  | { ok: true; ids: string[]; inMs: number; outMs: number }
  | { ok: false; error: string };

function byTime(a: SessionEvent, b: SessionEvent): number {
  return a.ms === b.ms ? a.id.localeCompare(b.id) : a.ms - b.ms;
}

// Same pairing as the Timesheet Approvals table (useTimesheetApprovals):
// from the clock-in, every event up to and including the next clock-out.
// A second clock-in before any clock-out means the session never closed.
export function collectSessionEvents(events: SessionEvent[], clockInId: string): CollectSessionResult {
  const sorted = events.filter((e) => Number.isFinite(e.ms)).sort(byTime);
  const start = sorted.findIndex((e) => e.id === clockInId);
  if (start === -1 || sorted[start].type !== "in") {
    return { ok: false, error: "That clock-in could not be found." };
  }
  const ids = [clockInId];
  for (let i = start + 1; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.type === "in") break;
    ids.push(e.id);
    if (e.type === "out") {
      return { ok: true, ids, inMs: sorted[start].ms, outMs: e.ms };
    }
  }
  return { ok: false, error: "This session has no clock-out yet. Only finished sessions can be moved." };
}

// The target employee's sessions (by effective time) that overlap
// [inMs, outMs]. An open session (no clock-out) runs to +Infinity. Any of
// the target's events landing inside the window also counts, so a stray
// break or clock-out can never interleave with the moved session.
export function findOverlap(
  targetEvents: SessionEvent[],
  inMs: number,
  outMs: number
): { startMs: number; endMs: number | null } | null {
  const sorted = targetEvents.filter((e) => Number.isFinite(e.ms)).sort(byTime);
  for (const e of sorted) {
    if (e.ms >= inMs && e.ms <= outMs) {
      return { startMs: e.ms, endMs: e.ms };
    }
  }
  let openIn: number | null = null;
  for (const e of sorted) {
    if (e.type === "in") {
      openIn = e.ms;
    } else if (e.type === "out" && openIn !== null) {
      if (openIn < outMs && e.ms > inMs) return { startMs: openIn, endMs: e.ms };
      openIn = null;
    }
  }
  if (openIn !== null && openIn < outMs) return { startMs: openIn, endMs: null };
  return null;
}

// Times are left out of the text (the server doesn't know the admin's time
// zone); the callable sends startMs/endMs as error details for the website
// to format locally.
export function overlapMessage(employeeName: string, overlap: { startMs: number; endMs: number | null }): string {
  return overlap.endMs === null
    ? `${employeeName} has an open session that overlaps this one. Nothing was moved.`
    : `${employeeName} already has time that overlaps this session. Nothing was moved.`;
}
