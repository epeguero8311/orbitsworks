import type { ClockEvent } from "@/lib/types";

// Website mirror of functions/src/clockCorrectionValidators.ts (the server
// runs the same check and is the one that counts) - keep both in sync by
// hand. Used by the "Adjust time" confirm step so an out-of-order time is
// caught before the call, and so the confirm can show the events on either
// side.

export const CORRECTION_FUTURE_SLACK_MS = 2 * 60 * 1000;
export const CORRECTION_REASON_MAX = 500;

export interface OrderedEvent {
  id: string;
  type: string;
  ms: number;
}

export interface CorrectionNeighbours {
  prev: OrderedEvent | null;
  next: OrderedEvent | null;
}

export interface CorrectionConflict {
  side: "before" | "after";
  neighbour: OrderedEvent;
}

function effectiveMs(event: Pick<ClockEvent, "adjustedTimestamp" | "timestamp">): number {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  return ts ? ts.toMillis() : NaN;
}

// The same employee's events, reduced to { id, type, effective ms }.
export function toOrderedEvents(events: ClockEvent[], employeeId: string): OrderedEvent[] {
  return events
    .filter((e) => e.employeeId === employeeId)
    .map((e) => ({ id: e.id, type: e.type, ms: effectiveMs(e) }));
}

export function findNeighbours(others: OrderedEvent[], eventId: string, currentMs: number): CorrectionNeighbours {
  let prev: OrderedEvent | null = null;
  let next: OrderedEvent | null = null;
  for (const e of others) {
    if (e.id === eventId || !Number.isFinite(e.ms)) continue;
    const isBefore = e.ms < currentMs || (e.ms === currentMs && e.id < eventId);
    if (isBefore) {
      if (!prev || e.ms > prev.ms) prev = e;
    } else if (!next || e.ms < next.ms) {
      next = e;
    }
  }
  return { prev, next };
}

export function findCorrectionConflict(
  others: OrderedEvent[],
  eventId: string,
  currentMs: number,
  newMs: number
): CorrectionConflict | null {
  const { prev, next } = findNeighbours(others, eventId, currentMs);
  if (prev && newMs <= prev.ms) return { side: "before", neighbour: prev };
  if (next && newMs >= next.ms) return { side: "after", neighbour: next };
  return null;
}

const TYPE_LABELS: Record<string, string> = {
  in: "clock-in",
  out: "clock-out",
  breakStart: "break start",
  breakEnd: "break end",
};

export function clockEventTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? "clock event";
}

export function correctionConflictMessage(type: string, conflict: CorrectionConflict): string {
  const self = clockEventTypeLabel(type);
  const other = clockEventTypeLabel(conflict.neighbour.type);
  return conflict.side === "before"
    ? `That time is out of order: this ${self} has to stay after the ${other} that comes before it.`
    : `That time is out of order: this ${self} has to stay before the ${other} that comes after it.`;
}

// What the confirm step shows, or the reason it can't be saved. Only the
// events this page has loaded are known here; the server checks the full
// history again.
export type CorrectionReview =
  | { ok: true; oldMs: number; newMs: number; neighbours: CorrectionNeighbours }
  | { ok: false; error: string };

export function reviewCorrection(
  target: ClockEvent,
  loadedEvents: ClockEvent[],
  newMs: number,
  reason = "",
  nowMs: number = Date.now()
): CorrectionReview {
  if (!Number.isInteger(newMs) || newMs <= 0) return { ok: false, error: "Pick a valid date and time." };
  if (newMs > nowMs + CORRECTION_FUTURE_SLACK_MS) {
    return { ok: false, error: "That time is in the future. Pick a time that has already happened." };
  }
  if (reason.trim().length > CORRECTION_REASON_MAX) {
    return { ok: false, error: `Keep the reason under ${CORRECTION_REASON_MAX} characters.` };
  }
  const oldMs = effectiveMs(target);
  if (!Number.isFinite(oldMs)) return { ok: false, error: "This clock event has no time to correct." };
  if (newMs === oldMs) return { ok: false, error: "That's the same time it already has." };
  const others = toOrderedEvents(loadedEvents, target.employeeId);
  const conflict = findCorrectionConflict(others, target.id, oldMs, newMs);
  if (conflict) return { ok: false, error: correctionConflictMessage(target.type, conflict) };
  return { ok: true, oldMs, newMs, neighbours: findNeighbours(others, target.id, oldMs) };
}
