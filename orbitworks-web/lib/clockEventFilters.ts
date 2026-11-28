// Time Tracking -> Clock events: the Filter button's rules and the
// 20-at-a-time "Show more" page size. Pure (no Firebase imports) so it
// runs under node --test (test/clockEventFilters.test.mjs).

export const CLOCK_EVENTS_PAGE = 20;

export type GeofenceFilter = "any" | "inside" | "outside";
export type FaceFilter = "any" | "notChecked" | "match" | "mismatch" | "noFace";

export type ClockEventFilters = {
  siteId: string; // "" = any site
  type: string; // "" = any type
  source: string; // "" = any source ("adjusted" = admin-adjusted events)
  timeFrom: string; // "HH:MM" local, "" = open
  timeTo: string; // "HH:MM" local, "" = open (inclusive minute)
  geofence: GeofenceFilter; // Pro only
  face: FaceFilter; // Pro only
};

export const EMPTY_CLOCK_EVENT_FILTERS: ClockEventFilters = {
  siteId: "",
  type: "",
  source: "",
  timeFrom: "",
  timeTo: "",
  geofence: "any",
  face: "any",
};

type Stamp = { toMillis: () => number } | null | undefined;

export type FilterableEvent = {
  type: string;
  source: string;
  siteId?: string | null;
  timestamp?: Stamp;
  adjustedTimestamp?: Stamp;
  geofenceStatus?: "inside" | "outside";
  faceCheck?: { status: string } | null;
};

const isBreak = (t: string) => t === "breakStart" || t === "breakEnd";

function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// How many filters are on. Core companies can't use the geofence / face
// ones (locked in the UI), so those never count for them.
export function activeFilterCount(f: ClockEventFilters, isPro: boolean): number {
  let n = 0;
  if (f.siteId) n++;
  if (f.type) n++;
  if (f.source) n++;
  if (f.timeFrom || f.timeTo) n++;
  if (isPro && f.geofence !== "any") n++;
  if (isPro && f.face !== "any") n++;
  return n;
}

// Geofence / face status only exists on clock in / out rows (breaks show
// "-"), so a break never matches a geofence or face filter.
export function filterClockEvents<T extends FilterableEvent>(
  events: T[],
  f: ClockEventFilters,
  isPro: boolean
): T[] {
  const from = minutesOf(f.timeFrom);
  const to = minutesOf(f.timeTo);
  return events.filter((e) => {
    if (f.siteId && (e.siteId ?? "") !== f.siteId) return false;
    if (f.type && e.type !== f.type) return false;
    if (f.source) {
      const adjusted = !!e.adjustedTimestamp;
      if (f.source === "adjusted" ? !adjusted : adjusted || e.source !== f.source) return false;
    }
    if (from != null || to != null) {
      const stamp = e.adjustedTimestamp ?? e.timestamp;
      if (!stamp) return false;
      const d = new Date(stamp.toMillis());
      const mins = d.getHours() * 60 + d.getMinutes();
      if (from != null && to != null && from > to) {
        // Overnight window, e.g. 22:00 - 02:00.
        if (mins < from && mins > to) return false;
      } else {
        if (from != null && mins < from) return false;
        if (to != null && mins > to) return false;
      }
    }
    if (isPro && f.geofence !== "any") {
      if (isBreak(e.type) || e.geofenceStatus !== f.geofence) return false;
    }
    if (isPro && f.face !== "any") {
      if (isBreak(e.type)) return false;
      const status = e.faceCheck?.status;
      if (f.face === "notChecked" ? !!status : status !== f.face) return false;
    }
    return true;
  });
}
