import type { MinimalClockEvent } from "./clockStatus";

// Mirrors orbitworks-web/lib/autoBreak.ts's applyAutoBreak exactly -
// functions/ is a separate npm package and can't import across that
// boundary, same reasoning as clockStatus.ts.
export function applyAutoBreak(
  grossMs: number,
  realBreakMs: number,
  hasClockOut: boolean,
  automaticBreakMinutes: number,
  minimumShiftHours: number
): { breakMs: number; netMs: number } {
  if (!hasClockOut || automaticBreakMinutes <= 0) {
    return { breakMs: realBreakMs, netMs: Math.max(0, grossMs - realBreakMs) };
  }
  const grossHours = grossMs / (1000 * 60 * 60);
  if (grossHours < minimumShiftHours) {
    return { breakMs: realBreakMs, netMs: Math.max(0, grossMs - realBreakMs) };
  }

  const autoBreakMs = automaticBreakMinutes * 60 * 1000;
  const breakMs = Math.min(realBreakMs + autoBreakMs, grossMs);
  return { breakMs, netMs: grossMs - breakMs };
}

export type ShiftSegment = {
  grossMs: number;
  breakMs: number;
  hasClockOut: boolean;
};

function effectiveMs(event: MinimalClockEvent): number | null {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  return ts ? ts.toDate().getTime() : null;
}

// Splits a chronologically-sorted sequence of one employee's clock events
// into individual in->out shifts (plus a trailing open segment if the last
// one hasn't clocked out yet), so a weekly total can apply the per-shift
// Auto Break deduction to each CLOSED shift without touching one that's
// still running. A new "in" seen before a prior "out" is a missed-clock-out
// anomaly - that stale segment has no known end, so it's dropped rather
// than guessed at (same as computePayrollAndSessions on the web side).
export function splitShiftSegments(
  sortedEvents: MinimalClockEvent[],
  nowMs: number
): ShiftSegment[] {
  const segments: ShiftSegment[] = [];
  let segStart: number | null = null;
  let segBreakMs = 0;
  let openBreakStart: number | null = null;

  for (const event of sortedEvents) {
    const ts = effectiveMs(event);
    if (ts == null) continue;

    switch (event.type) {
      case "in":
        segStart = ts;
        segBreakMs = 0;
        openBreakStart = null;
        break;
      case "breakStart":
        if (segStart != null && openBreakStart == null) openBreakStart = ts;
        break;
      case "breakEnd":
        if (openBreakStart != null) {
          const ms = ts - openBreakStart;
          if (ms > 0) segBreakMs += ms;
          openBreakStart = null;
        }
        break;
      case "out":
        if (segStart != null) {
          const grossMs = ts - segStart;
          if (grossMs > 0) segments.push({ grossMs, breakMs: segBreakMs, hasClockOut: true });
          segStart = null;
          segBreakMs = 0;
          openBreakStart = null;
        }
        break;
    }
  }

  if (segStart != null) {
    const grossMs = nowMs - segStart;
    if (grossMs > 0) segments.push({ grossMs, breakMs: segBreakMs, hasClockOut: false });
  }

  return segments;
}
