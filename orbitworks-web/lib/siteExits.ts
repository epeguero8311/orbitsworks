import type { SiteExit } from "@/lib/types";

// Employee App Phase 8 - "Left the job site" on the website: which stretch
// is red and which is gray, and the line shown on a shift (day view,
// lookup, event detail). Pure, no Firebase - unit tested in
// test/siteExits.test.mjs. Reads are in lib/hooks/useSiteExitsByClockIn.ts.
//
// Red: a "left" that did not start on a break and was not short.
// Gray: on a break (D10/E1), short - returned within 3 min (F1 b), and every
// "tracking off" (D13). Leaving is a flag only; nothing here changes hours.

// F1 b: a "left" that ended by returning within this is gray "short".
// Mirrors orbitworks-app/lib/siteExitLogic.js SHORT_EXIT_MS.
export const SHORT_EXIT_MS = 3 * 60 * 1000;

export type SiteExitTone = "red" | "gray";

type ExitLike = Pick<SiteExit, "kind" | "startMs" | "endMs" | "endReason" | "onBreak">;

export function isShortExit(exit: ExitLike): boolean {
  return exit.kind === "left" && exit.endReason === "returned" && exit.endMs != null && exit.endMs - exit.startMs < SHORT_EXIT_MS;
}

export function siteExitTone(exit: ExitLike): SiteExitTone {
  if (exit.kind !== "left") return "gray";
  if (exit.onBreak || isShortExit(exit)) return "gray";
  return "red";
}

// The red ones (Timesheet Approvals warning).
export function redSiteExits<T extends ExitLike>(exits: T[]): T[] {
  return exits.filter((e) => siteExitTone(e) === "red");
}

const OFF_REASON_TEXT: Record<string, string> = {
  permission: "location permission off",
  signedOut: "signed out of the app",
  appStopped: "phone stopped tracking",
  noFix: "no good location fix",
};

function endText(exit: Pick<SiteExit, "endMs" | "endReason" | "kind">, formatTime: (ms: number) => string): string {
  if (exit.endMs == null) return exit.kind === "left" ? "no return yet" : "still off";
  if (exit.endReason === "clockOut") return `clock-out ${formatTime(exit.endMs)}`;
  if (exit.endReason === "autoClockOut") return `auto clock-out ${formatTime(exit.endMs)}`;
  return formatTime(exit.endMs);
}

// "Left the job site from 10:42 AM - 11:05 AM", with "(on break)" /
// "(short)"; "Tracking off from 9:00 AM - 9:20 AM (signed out of the app)".
export function siteExitLine(
  exit: Pick<SiteExit, "kind" | "startMs" | "endMs" | "endReason" | "onBreak" | "offReason">,
  formatTime: (ms: number) => string
): string {
  const range = `from ${formatTime(exit.startMs)} - ${endText(exit, formatTime)}`;
  if (exit.kind === "trackingOff") {
    const why = exit.offReason ? OFF_REASON_TEXT[exit.offReason] : null;
    return `Tracking off ${range}${why ? ` (${why})` : ""}`;
  }
  const tag = exit.onBreak ? " (on break)" : isShortExit(exit) ? " (short)" : "";
  return `Left the job site ${range}${tag}`;
}

// clockInEventId -> that shift's stretches, oldest first.
export function groupSiteExitsByClockIn<T extends Pick<SiteExit, "clockInEventId" | "startMs">>(exits: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of exits) {
    if (!e.clockInEventId) continue;
    const list = map.get(e.clockInEventId) ?? [];
    list.push(e);
    map.set(e.clockInEventId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.startMs - b.startMs);
  return map;
}

// ---- Phase 9: totals for Reports / Excel / Approvals ----

// Minutes of one stretch. An open one counts up to openEndMs (the shift's
// clock-out, or now while still clocked in).
export function exitMinutes(exit: Pick<SiteExit, "startMs" | "endMs">, openEndMs: number): number {
  const end = exit.endMs ?? openEndMs;
  return Math.max(0, Math.round((end - exit.startMs) / 60000));
}

export interface SiteExitSummary {
  redCount: number;
  redMinutes: number;
  grayCount: number;
  grayMinutes: number; // on break + short "left"
  trackingOffMinutes: number;
}

export function summarizeSiteExits(exits: ExitLike[], openEndMs: number): SiteExitSummary {
  const out: SiteExitSummary = { redCount: 0, redMinutes: 0, grayCount: 0, grayMinutes: 0, trackingOffMinutes: 0 };
  for (const e of exits) {
    const min = exitMinutes(e, openEndMs);
    if (e.kind === "trackingOff") {
      out.grayCount += 1;
      out.trackingOffMinutes += min;
    } else if (siteExitTone(e) === "red") {
      out.redCount += 1;
      out.redMinutes += min;
    } else {
      out.grayCount += 1;
      out.grayMinutes += min;
    }
  }
  return out;
}

// The tag for one stretch in Reports / Excel.
export function siteExitTag(exit: Pick<SiteExit, "kind" | "startMs" | "endMs" | "endReason" | "onBreak" | "offReason">): string {
  if (exit.kind === "trackingOff") return `Tracking off${exit.offReason ? ` (${OFF_REASON_TEXT[exit.offReason] ?? exit.offReason})` : ""}`;
  if (exit.onBreak) return "Left - on break";
  if (isShortExit(exit)) return "Left - short";
  return "Left the job site";
}

// ---- Phase 9 (H8 a): the Overview "Left the job site" card ----
//   outsideNow - red "left" stretches with no end yet (still clocked in and
//                outside the site right now), newest first
//   todayByPerson - every stretch that started today, per person, newest
//                first; more than MAX_PER_PERSON shows "+N more"

export const MAX_PER_PERSON = 3;

export function outsideNow<T extends Pick<SiteExit, "kind" | "startMs" | "endMs" | "endReason" | "onBreak">>(exits: T[]): T[] {
  return exits.filter((e) => e.endMs === null && siteExitTone(e) === "red").sort((a, b) => b.startMs - a.startMs);
}

export interface PersonExits<T> {
  employeeId: string;
  employeeName: string;
  shown: T[];
  more: number;
}

export function todayByPerson<T extends Pick<SiteExit, "employeeId" | "employeeName" | "startMs">>(exits: T[]): PersonExits<T>[] {
  const byId = new Map<string, T[]>();
  for (const e of exits) byId.set(e.employeeId, [...(byId.get(e.employeeId) ?? []), e]);
  return [...byId.entries()]
    .map(([employeeId, list]) => {
      const sorted = [...list].sort((a, b) => b.startMs - a.startMs);
      return { employeeId, employeeName: sorted[0].employeeName, shown: sorted.slice(0, MAX_PER_PERSON), more: Math.max(0, sorted.length - MAX_PER_PERSON) };
    })
    .sort((a, b) => b.shown[0].startMs - a.shown[0].startMs);
}
