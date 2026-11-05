import type { ClockEvent } from "@/lib/types";

export function effectiveDate(event: ClockEvent): Date | null {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  return ts ? ts.toDate() : null;
}

// Phase 9: the event detail window used its own shorter copy of this, so an
// auto clock-out, supervisor PIN, auto break end or deactivation punch
// showed "Unknown" there. One list now - the day view's (lib/clockStatus.ts).
export { sourceLabel } from "@/lib/clockStatus";

export function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
