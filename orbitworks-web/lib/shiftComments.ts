import type { ClockEvent, ShiftNote } from "@/lib/types";

// Employee App Phase 5 - comments an employee left on one of their own
// shifts in the app (shiftNotes with a clockEventId = the shift's clock-in
// id). The website shows them in the clock-in row's Note cell (day view,
// lookup) and on the Clock in side of the event detail. Pure, no Firebase -
// unit tested in test/shiftComments.test.mjs. The reads are in
// lib/hooks/useShiftCommentsByClockIn.ts.

// Firestore's limit for one "in" filter.
export const COMMENT_IDS_PER_QUERY = 30;

type EventKey = Pick<ClockEvent, "id" | "type">;

// The clock-in ids in a list of events (only clock-in rows show
// comments), each once and sorted, so the same events give the same
// query key.
export function clockInIds(events: EventKey[]): string[] {
  const ids = new Set<string>();
  for (const e of events) if (e.type === "in" && e.id) ids.add(e.id);
  return [...ids].sort();
}

export function chunkIds(ids: string[], size: number = COMMENT_IDS_PER_QUERY): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

// When the comment was typed (madeAtMs, phone time - an offline comment
// reaches the server later), else when it reached the server. null = no
// time yet.
export function commentTimeMs(note: Pick<ShiftNote, "madeAtMs" | "timestamp">): number | null {
  if (typeof note.madeAtMs === "number") return note.madeAtMs;
  if (note.timestamp && typeof note.timestamp.toMillis === "function") return note.timestamp.toMillis();
  return null;
}

// clockEventId -> that shift's comments, oldest first (no time last).
// Notes with no clockEventId (supervisor site notes) are skipped.
export function groupCommentsByClockIn(notes: ShiftNote[]): Map<string, ShiftNote[]> {
  const byClockIn = new Map<string, ShiftNote[]>();
  for (const n of notes) {
    if (typeof n.clockEventId !== "string" || !n.clockEventId) continue;
    const list = byClockIn.get(n.clockEventId) ?? [];
    list.push(n);
    byClockIn.set(n.clockEventId, list);
  }
  const at = (n: ShiftNote) => commentTimeMs(n) ?? Infinity;
  for (const list of byClockIn.values()) list.sort((a, b) => at(a) - at(b));
  return byClockIn;
}

// The comments to show on one event: its shift's comments on a clock-in,
// nothing on any other event.
export function commentsForEvent(byClockIn: Map<string, ShiftNote[]>, event: EventKey | null): ShiftNote[] {
  if (!event || event.type !== "in") return [];
  return byClockIn.get(event.id) ?? [];
}
