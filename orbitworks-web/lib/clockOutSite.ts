// Phase 10 fix round 2 (B b) - a clock-out is detected on its own, so a
// shift can start at one site and end at another. The shift's hours still
// count under the clock-in site everywhere (A a); this is the quiet note
// that says where the clock-out happened. Info only: no alert, no push.
// No imports, so test/phase10Lib.test.mjs runs it under plain Node.

type SiteEvent = { type?: string; siteId?: string | null; siteName?: string | null } | null | undefined;

const NO_SITE = "Not specified";

function siteIdOf(e: SiteEvent): string | null {
  return e && typeof e.siteId === "string" && e.siteId !== "" ? e.siteId : null;
}

function siteLabel(e: SiteEvent): string {
  return siteIdOf(e) ? (e?.siteName || NO_SITE) : NO_SITE;
}

// Both events of one shift. null = same site, no clock-out yet, or not a
// clock-out at all.
function differs(clockIn: SiteEvent, clockOut: SiteEvent): boolean {
  if (!clockIn || !clockOut || clockOut.type !== "out") return false;
  return siteIdOf(clockIn) !== siteIdOf(clockOut);
}

// Timesheet Approvals row (under the clock-in site): "Clocked out at Site B".
export function clockOutSiteNote(clockIn: SiteEvent, clockOut: SiteEvent): string | null {
  return differs(clockIn, clockOut) ? `Clocked out at ${siteLabel(clockOut)}` : null;
}

// Event detail window: on the clock-in, where it ended; on the clock-out,
// where it started. Breaks and single events say nothing.
export function sessionSiteNote(shown: SiteEvent, clockIn: SiteEvent, clockOut: SiteEvent): string | null {
  if (!differs(clockIn, clockOut) || !shown) return null;
  if (shown.type === "in") return `Clocked out at ${siteLabel(clockOut)}`;
  if (shown.type === "out") return `Clocked in at ${siteLabel(clockIn)} - the shift's hours count there`;
  return null;
}
