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
