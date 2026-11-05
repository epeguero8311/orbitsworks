import type { ClockEvent } from "@/lib/types";

// Phase 9 (H6 a): the punches of a session that reached the server late
// (Employee App queued punches, syncedLate - see functions/src/
// employeeClockQueued.ts). Pure - test/syncedLate.test.mjs. lateMs = when
// it reached the server (createdAt) minus the punch time (null if unknown).

type Stamp = { toMillis: () => number } | null | undefined;
type EventLike = Pick<ClockEvent, "id" | "type" | "syncedLate"> & { timestamp?: Stamp; createdAt?: Stamp };

export interface SyncedLatePunch {
  id: string;
  type: ClockEvent["type"];
  lateMs: number | null;
}

function ms(v: Stamp): number | null {
  return v && typeof v.toMillis === "function" ? v.toMillis() : null;
}

export function syncedLatePunches(events: EventLike[]): SyncedLatePunch[] {
  return events
    .filter((e) => e.syncedLate === true)
    .map((e) => {
      const at = ms(e.timestamp);
      const arrived = ms(e.createdAt);
      return { id: e.id, type: e.type, lateMs: at !== null && arrived !== null ? Math.max(0, arrived - at) : null };
    });
}

// "12 min late", "3 h 5 min late", "late".
export function lateLabel(lateMs: number | null): string {
  if (lateMs === null) return "late";
  const minutes = Math.round(lateMs / 60000);
  if (minutes < 60) return `${minutes} min late`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min late` : `${h} h late`;
}
