import type { ClockEvent } from "./types";

// Single source of truth for mapping a clock event's raw type to a display
// status, plus shared badge label helpers, so the dashboard, time tracking
// page, and event tables can never drift out of sync with each other.
export type ClockStatus = "in" | "break" | "out";

const STATUS_BY_EVENT_TYPE: Record<ClockEvent["type"], ClockStatus> = {
  in: "in",
  breakStart: "break",
  breakEnd: "in",
  out: "out",
};

export function deriveStatus(type: ClockEvent["type"] | undefined): ClockStatus {
  if (!type) return "out";
  return STATUS_BY_EVENT_TYPE[type] ?? "out";
}

export function typeLabel(type: ClockEvent["type"]): { text: string; className: string } {
  switch (type) {
    case "in":
      return { text: "Clock in", className: "text-green-700" };
    case "out":
      return { text: "Clock out", className: "text-gray-600" };
    case "breakStart":
      return { text: "Start break", className: "text-amber-700" };
    case "breakEnd":
      return { text: "End break", className: "text-blue-700" };
    default:
      return { text: "Unknown", className: "text-gray-600" };
  }
}

export function sourceLabel(source: ClockEvent["source"]): { text: string; className: string } {
  switch (source) {
    case "faceMatch":
      return { text: "Face match", className: "bg-green-50 text-green-700" };
    case "pin":
      return { text: "PIN", className: "bg-purple-50 text-purple-700" };
    case "supervisorOverride":
      return { text: "Supervisor override", className: "bg-amber-50 text-amber-700" };
    case "adminManual":
      return { text: "Admin manual", className: "bg-blue-50 text-blue-700" };
    case "autoClockOut":
      return { text: "Auto clock-out", className: "bg-orange-50 text-orange-700" };
    case "supervisorPin":
      return { text: "Supervisor PIN", className: "bg-indigo-50 text-indigo-700" };
    case "autoBreakEnd":
      return { text: "Auto break end", className: "bg-orange-50 text-orange-700" };
    default:
      return { text: "Unknown", className: "bg-gray-50 text-gray-600" };
  }
}

function effectiveMs(event: ClockEvent): number | null {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  return ts ? ts.toDate().getTime() : null;
}

// Walks a chronologically-sorted (ascending, by effective time) sequence of
// clock events for a SINGLE employee and sums up actual working time,
// stepping over any breakStart-to-breakEnd span rather than counting it as
// worked. An open "in" or "breakEnd" segment with no closing event yet is
// carried through to nowMs. A break never resets the running total - it
// just pauses it. Used both for a single shift and for summing a whole
// week, so callers share one definition of "worked time".
export function accumulateWorkedMs(sortedEvents: ClockEvent[], nowMs: number): number {
  let totalMs = 0;
  let workSegmentStart: number | null = null;

  for (const event of sortedEvents) {
    const ts = effectiveMs(event);
    if (ts == null) continue;

    switch (event.type) {
      case "in":
      case "breakEnd":
        workSegmentStart = ts;
        break;
      case "breakStart":
      case "out":
        if (workSegmentStart != null) {
          totalMs += ts - workSegmentStart;
          workSegmentStart = null;
        }
        break;
    }
  }

  if (workSegmentStart != null) {
    totalMs += nowMs - workSegmentStart;
  }

  return totalMs;
}

// Given ALL known events for a single employee (any order, may span many
// days), finds the boundary of their current still-open shift - the most
// recent "out" marks the end of the prior shift, so the shift starts right
// after it - and returns accumulated worked ms for just that shift, with
// break time excluded but never resetting the counter across breaks.
export function getAccumulatedWorkedMs(employeeEvents: ClockEvent[], now: Date): number {
  const sorted = [...employeeEvents].sort((a, b) => {
    const aMs = effectiveMs(a) ?? 0;
    const bMs = effectiveMs(b) ?? 0;
    return aMs - bMs;
  });

  let shiftStartIndex = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].type === "out") {
      shiftStartIndex = i + 1;
      break;
    }
  }

  const shiftEvents = sorted.slice(shiftStartIndex);
  return accumulateWorkedMs(shiftEvents, now.getTime());
}