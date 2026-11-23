// B (2026-11-21): what Approve Hours shows about a session's punches that
// need a look (functions/src/latePunchTypes.ts). Pure - test/punchFlags.test.mjs.
//   problems (red): the phone's clock was set back, the photo is missing
//     (face not checked), or the punch doesn't fit the other punches
//   replaced (yellow): auto clock-out / hand-entered events a real queued
//     punch replaced - each with its own time next to the real one

type Stamp = { toMillis: () => number } | null | undefined;

export type FlagEvent = {
  id: string;
  type: string;
  timestamp?: Stamp;
  phoneClockOff?: boolean;
  photoMissing?: boolean;
  punchConflict?: boolean;
  replacedEvents?: { id: string; type: string; source: string; timestampMs: number }[];
};

export interface FlaggedPunch {
  id: string;
  type: string;
  atMs: number | null;
  items: string[];
}

export interface ReplacedPunch {
  id: string;
  type: string;
  atMs: number | null;
  replaced: { type: string; source: string; atMs: number }[];
}

const SOURCE_TEXT: Record<string, string> = { autoClockOut: "auto", adminManual: "hand-entered" };

export function replacedSourceText(source: string): string {
  return SOURCE_TEXT[source] ?? "earlier";
}

function ms(v: Stamp): number | null {
  return v && typeof v.toMillis === "function" ? v.toMillis() : null;
}

export function punchProblems(events: FlagEvent[]): FlaggedPunch[] {
  const out: FlaggedPunch[] = [];
  for (const e of events) {
    const items: string[] = [];
    if (e.phoneClockOff === true) items.push("The phone's clock was set back");
    if (e.photoMissing === true) items.push("Photo missing, face not checked");
    if (e.punchConflict === true) items.push("Doesn't fit the other punches - check Time Tracking");
    if (items.length) out.push({ id: e.id, type: e.type, atMs: ms(e.timestamp), items });
  }
  return out;
}

export function replacedPunches(events: FlagEvent[]): ReplacedPunch[] {
  return events
    .filter((e) => Array.isArray(e.replacedEvents) && e.replacedEvents.length > 0)
    .map((e) => ({
      id: e.id,
      type: e.type,
      atMs: ms(e.timestamp),
      replaced: (e.replacedEvents ?? []).map((r) => ({ type: r.type, source: r.source, atMs: r.timestampMs })),
    }));
}
