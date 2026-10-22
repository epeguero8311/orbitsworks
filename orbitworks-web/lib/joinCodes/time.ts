// Join code expiry is picked as a wall-clock time in the company timezone
// (America/Chicago), whatever timezone the admin's browser is in. Pure Intl
// math - safe on the client and the server. No imports, so the plain-Node
// unit test (test/joinCodeTime.test.mjs) can load this file directly.

// Same value as COMPANY_TIMEZONE in lib/reportUtils.ts (the unit test checks).
export const COMPANY_TIMEZONE = "America/Chicago";

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// "2026-10-22T17:30" (datetime-local value, company TZ) -> ISO string in UTC.
export function companyLocalToIso(local: string, timeZone: string = COMPANY_TIMEZONE): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = wall - tzOffsetMs(wall, timeZone);
  // Second pass settles the DST-boundary case.
  utc = wall - tzOffsetMs(utc, timeZone);
  return new Date(utc).toISOString();
}

// Epoch millis -> "2026-10-22T17:30" in company TZ, for the datetime-local input.
export function msToCompanyLocal(ms: number, timeZone: string = COMPANY_TIMEZONE): string {
  const local = new Date(ms + tzOffsetMs(ms, timeZone));
  return local.toISOString().slice(0, 16);
}

// Display, e.g. "Oct 22, 2026, 5:30 PM CDT". Explicit component options on
// purpose: dateStyle/timeStyle can't be combined with timeZoneName (throws
// "Invalid option" in Chrome/V8).
export function formatCompanyDateTime(ms: number, timeZone: string = COMPANY_TIMEZONE): string {
  return new Date(ms).toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
