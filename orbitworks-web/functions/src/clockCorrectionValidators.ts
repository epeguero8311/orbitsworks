import { z } from "zod";

// ---- correctClockEvent (admin "Adjust time") ----
//
// Mirrored on the website in lib/clockCorrection.ts (the confirm step runs
// the same check before calling the server) - keep both in sync by hand.
// The input shape is exactly what the live website already sends
// ({ eventId, newTimestamp, reason? }), so older website builds keep
// working against this server. Not .strict() for the same reason.

// How far into the future a corrected time may be (phone/browser clock
// drift). Same 2-minute allowance as employee comments (madeAtMs).
export const CORRECTION_FUTURE_SLACK_MS = 2 * 60 * 1000;
export const CORRECTION_REASON_MAX = 500;

export const correctClockEventSchema = z.object({
  eventId: z.string().trim().min(1, "eventId is required.").max(200),
  newTimestamp: z
    .number({ error: "newTimestamp is required and must be a number (epoch ms)." })
    .int("newTimestamp must be whole milliseconds.")
    .positive("newTimestamp must be a real time."),
  reason: z
    .string()
    .trim()
    .max(CORRECTION_REASON_MAX, `Keep the reason under ${CORRECTION_REASON_MAX} characters.`)
    .optional()
    .transform((r) => (r ? r : undefined)),
});

export type CorrectClockEventInput = z.infer<typeof correctClockEventSchema>;

// One of the employee's clock events, reduced to what the order check needs.
// ms is the EFFECTIVE time (adjustedTimestamp ?? timestamp).
export interface OrderedEvent {
  id: string;
  type: string;
  ms: number;
}

export interface CorrectionConflict {
  // "before": the new time is at or before the event that comes before this
  // one; "after": at or after the one that comes after it.
  side: "before" | "after";
  neighbour: OrderedEvent;
}

// The event being corrected must stay strictly between its current
// neighbours (the employee's previous and next events by effective time),
// so a correction can never reorder a shift - a clock-in after its own
// clock-out, a break end before its break start, and so on. `others` may
// include the event itself (it is skipped) and may be in any order.
export function findCorrectionConflict(
  others: OrderedEvent[],
  eventId: string,
  currentMs: number,
  newMs: number
): CorrectionConflict | null {
  let prev: OrderedEvent | null = null;
  let next: OrderedEvent | null = null;
  for (const e of others) {
    if (e.id === eventId || !Number.isFinite(e.ms)) continue;
    // Ties at the current time: an event at exactly the same ms counts as
    // "before" when its id sorts first, so the result is stable.
    const isBefore = e.ms < currentMs || (e.ms === currentMs && e.id < eventId);
    if (isBefore) {
      if (!prev || e.ms > prev.ms) prev = e;
    } else if (!next || e.ms < next.ms) {
      next = e;
    }
  }
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
