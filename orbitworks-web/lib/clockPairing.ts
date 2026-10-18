import type { ClockEvent } from "@/lib/types";
import { effectiveDate } from "@/lib/clockEventDetailUtils";

export interface ClockSession {
  clockInEvent: ClockEvent | null;
  clockOutEvent: ClockEvent | null;
}

// Ordered pairing, not "any in + any out on the same day": an out only
// pairs with the in immediately before it, and an in only pairs with the
// out immediately after it. Overnight shifts and auto clock-outs can cross
// midnight, so this intentionally does not restrict to a calendar day.
export function findSession(
  events: ClockEvent[],
  clickedId: string
): ClockSession {
  const clicked = events.find((e) => e.id === clickedId);
  if (!clicked || (clicked.type !== "in" && clicked.type !== "out")) {
    return { clockInEvent: null, clockOutEvent: null };
  }

  const sorted = events
    .filter(
      (e) =>
        e.employeeId === clicked.employeeId &&
        (e.type === "in" || e.type === "out")
    )
    .sort((a, b) => {
      const da = effectiveDate(a)?.getTime() ?? 0;
      const db = effectiveDate(b)?.getTime() ?? 0;
      return da - db;
    });

  const index = sorted.findIndex((e) => e.id === clickedId);
  if (index === -1) {
    return { clockInEvent: null, clockOutEvent: null };
  }

  if (clicked.type === "in") {
    const next = sorted[index + 1] ?? null;
    const clockOutEvent = next && next.type === "out" ? next : null;
    return { clockInEvent: clicked, clockOutEvent };
  }

  const prev = sorted[index - 1] ?? null;
  const clockInEvent = prev && prev.type === "in" ? prev : null;
  return { clockInEvent, clockOutEvent: clicked };
}
