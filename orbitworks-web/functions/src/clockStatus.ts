import type { Timestamp } from "firebase-admin/firestore";

// Mirrors orbitworks-web/lib/clockStatus.ts's deriveStatus/accumulateWorkedMs/
// getAccumulatedWorkedMs exactly - functions/ is a separate npm package and
// can't import across that boundary. Alert thresholds (maxHours, overtime,
// breakTooLong) must agree with what the dashboard already shows for the
// same employee, so this needs to stay byte-for-byte the same logic, just
// typed against admin.firestore.Timestamp instead of the client SDK's.
export type ClockStatus = "in" | "break" | "out";

export interface MinimalClockEvent {
  id: string;
  employeeId: string;
  type: "in" | "out" | "breakStart" | "breakEnd";
  timestamp?: Timestamp;
  adjustedTimestamp?: Timestamp;
}

const STATUS_BY_EVENT_TYPE: Record<MinimalClockEvent["type"], ClockStatus> = {
  in: "in",
  breakStart: "break",
  breakEnd: "in",
  out: "out",
};

export function deriveStatus(type: MinimalClockEvent["type"] | undefined): ClockStatus {
  if (!type) return "out";
  return STATUS_BY_EVENT_TYPE[type] ?? "out";
}

function effectiveMs(event: MinimalClockEvent): number | null {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  return ts ? ts.toDate().getTime() : null;
}

export function effectiveDate(event: MinimalClockEvent): Date | null {
  const ms = effectiveMs(event);
  return ms == null ? null : new Date(ms);
}

export function accumulateWorkedMs(sortedEvents: MinimalClockEvent[], nowMs: number): number {
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

export function getAccumulatedWorkedMs(employeeEvents: MinimalClockEvent[], now: Date): number {
  const sorted = [...employeeEvents].sort((a, b) => (effectiveMs(a) ?? 0) - (effectiveMs(b) ?? 0));

  let shiftStartIndex = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].type === "out") {
      shiftStartIndex = i + 1;
      break;
    }
  }

  return accumulateWorkedMs(sorted.slice(shiftStartIndex), now.getTime());
}
