import { SAME_PUNCH_WINDOW_MS } from "./latePunchTypes";

// ---- B (2026-11-21): where a late queued punch goes, and what it replaces ----
//
// A queued (offline) Employee App punch is put in at its own time among the
// employee's other events - never refused for its age or for a later punch.
// Pure (no Firestore) so test/latePunchPlacement.test.js runs it in node.
//
// "Fits" = the punch makes sense after the event just before it (same rule
// as an online punch: no clock-in while clocked in, no clock-out while out
// or on a break, ...).
//
// A REAL punch wins over events that stand in for one:
//   - auto clock-out (source "autoClockOut", with its auto break end at the
//     same time): removed when the punch lands in the shift it closed -
//     before it (the shift's next "out" after the punch is that auto one),
//     or right after it when it stops the punch from fitting (the real
//     clock-out came later than the auto one).
//   - hand-entered (source "adminManual") of the SAME type within
//     SAME_PUNCH_WINDOW_MS (12 h) that stops the punch from fitting, just
//     before or just after it: the same punch, entered by hand while the
//     real one was still on the phone. Removed; a replaced hand-entered
//     clock-in or clock-out also takes the hand-entered breaks of its shift.
//     The shift's other hand-entered end stays until the phone's own
//     matching punch replaces it (it may never come - e.g. no clock-out).
// Anything else that doesn't fit before the punch (two real clock-ins, a
// clock-out with nothing open) stays, and the punch is recorded anyway with
// conflict: true. Real events AFTER the punch that don't fit are not a
// conflict: the rest of the phone's queue usually fixes that (Sat in, then
// Mon in, then Sat out).

export type PlacedEvent = {
  id: string;
  type: string; // in | out | breakStart | breakEnd
  source: string;
  ms: number;
};

export type Placement = {
  remove: PlacedEvent[];
  conflict: boolean;
};

type Status = "in" | "break" | "out";

export function statusAfterType(type: string | undefined): Status {
  if (type === "in" || type === "breakEnd") return "in";
  if (type === "breakStart") return "break";
  return "out";
}

// Same rule as employeeClock.ts wrongStateMessage, as a yes/no.
export function fitsAfter(action: string, status: Status): boolean {
  if (action === "in") return status === "out";
  if (action === "out") return status === "in";
  if (action === "breakStart") return status === "in";
  if (action === "breakEnd") return status === "break";
  return false;
}

// Events at the same ms in the order they happened (an auto break end comes
// just before its auto clock-out).
const RANK: Record<string, number> = { in: 0, breakStart: 1, breakEnd: 2, out: 3 };
const rank = (e: PlacedEvent) => RANK[e.type] ?? 0;
const chronological = (a: PlacedEvent, b: PlacedEvent) => a.ms - b.ms || rank(a) - rank(b);

const isAuto = (e: PlacedEvent) => e.source === "autoClockOut";
const isHand = (e: PlacedEvent) => e.source === "adminManual";
const isEnd = (e: PlacedEvent) => e.type === "in" || e.type === "out";

function sameHandPunch(e: PlacedEvent, action: string, eventMs: number): boolean {
  return isHand(e) && e.type === action && Math.abs(e.ms - eventMs) <= SAME_PUNCH_WINDOW_MS;
}

// before: the employee's events at or before the punch's time; after: the
// ones after it (any order - sorted here). The caller reads ~25 each way,
// enough for a whole shift on each side.
export function placeLatePunch(input: {
  action: string;
  eventMs: number;
  before: PlacedEvent[];
  after: PlacedEvent[];
}): Placement {
  const { action, eventMs } = input;
  const before = [...input.before].sort(chronological).reverse(); // newest first
  const after = [...input.after].sort(chronological); // oldest first
  const removed = new Map<string, PlacedEvent>();
  const drop = (e: PlacedEvent) => removed.set(e.id, e);
  let conflict = false;

  // 1. Before the punch: remove auto / same hand-entered events that stop
  // it from fitting.
  let fits = false;
  for (const prev of before) {
    if (fitsAfter(action, statusAfterType(prev.type))) {
      fits = true;
      break;
    }
    if (isAuto(prev) || sameHandPunch(prev, action, eventMs)) {
      drop(prev);
      continue;
    }
    break;
  }
  // Ran out of events: as if clocked out.
  if (!fits && before.every((e) => removed.has(e.id))) fits = fitsAfter(action, "out");
  if (!fits) conflict = true;

  // 2. Just after the punch: a same hand-entered event that doesn't fit is
  // the same punch entered by hand.
  const status = statusAfterType(action);
  for (const next of after) {
    if (fitsAfter(next.type, status)) break;
    if (sameHandPunch(next, action, eventMs)) {
      drop(next);
      continue;
    }
    break;
  }

  // 3. The auto clock-out that closed the shift the punch landed in: the
  // first "out" after the punch, before any clock-in.
  for (const next of after) {
    if (removed.has(next.id)) continue;
    if (next.type === "in") break;
    if (next.type === "out") {
      if (isAuto(next)) drop(next);
      break;
    }
  }

  // 4. An auto break end goes with its auto clock-out (same time).
  const autoTimes = new Set([...removed.values()].filter((e) => isAuto(e) && e.type === "out").map((e) => e.ms));
  for (const e of [...before, ...after]) {
    if (isAuto(e) && autoTimes.has(e.ms)) drop(e);
  }

  // 5. A replaced hand-entered clock-in / clock-out takes the hand-entered
  // breaks of its shift.
  for (const end of [...removed.values()].filter((e) => isHand(e) && isEnd(e))) {
    const side = end.type === "in" ? after : before;
    for (const e of side) {
      if (removed.has(e.id)) continue;
      if (isEnd(e)) break;
      if (isHand(e)) drop(e);
    }
  }

  return { remove: [...removed.values()].sort(chronological), conflict };
}

// The employee's newest event once the punch is in and the removed events
// are gone - for employees/{id}.lastEventType. latest: their newest events
// before the change (any order).
export function newestAfterPlacement(
  latest: PlacedEvent[],
  punch: PlacedEvent,
  remove: PlacedEvent[]
): PlacedEvent {
  const gone = new Set(remove.map((e) => e.id));
  const left = latest.filter((e) => !gone.has(e.id) && e.id !== punch.id);
  return [...left, punch].sort(chronological)[left.length];
}
