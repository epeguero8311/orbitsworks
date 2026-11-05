import type { Timestamp } from "firebase-admin/firestore";

// ---- Employee App Phase 8: leaving the job site ----
//
// Mirrors orbitworks-web/lib/types.ts (SiteExit and friends) - this package
// can't import across the web boundary, keep both in sync.
//
// companies/{companyId}/siteExits/{exitId}: one stretch of a tracked shift
// when the worker was outside the clock-in site's radius ("left"), or the
// phone could not track them ("trackingOff"). Server-written only.
// Nothing here ever blocks, changes or ends a punch.

export const SITE_EXIT_KINDS = ["left", "trackingOff"] as const;
export type SiteExitKind = (typeof SITE_EXIT_KINDS)[number];

export const SITE_EXIT_END_REASONS = ["returned", "trackingOn", "clockOut", "autoClockOut"] as const;
export type SiteExitEndReason = (typeof SITE_EXIT_END_REASONS)[number];

// noFix (E4): the OS said the worker left, but the phone could not get a
// fix good enough to confirm it - a gap, so a real exit is never lost.
export const SITE_EXIT_OFF_REASONS = ["permission", "signedOut", "appStopped", "noFix"] as const;
export type SiteExitOffReason = (typeof SITE_EXIT_OFF_REASONS)[number];

export interface SiteExitDoc {
  employeeId: string;
  employeeName: string;
  clockInEventId: string;
  siteId: string | null;
  siteName: string;
  kind: SiteExitKind;
  startMs: number;
  endMs: number | null;
  endReason: SiteExitEndReason | null;
  onBreak: boolean;
  offReason: SiteExitOffReason | null;
  distanceM: number | null;
  startLocation: { lat: number; lng: number } | null;
  startAccuracyM: number | null;
  endLocation: { lat: number; lng: number } | null;
  endAccuracyM: number | null;
  hasLocation: boolean;
  locationRemovedAt?: Timestamp;
  queued: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Times are kept forever; locations are cleared after this many days
// (cleanupSiteExitLocations), same window as clock photos.
export const SITE_EXIT_LOCATION_RETENTION_DAYS = 90;

// Safety cap: a shift never gets more stretches than this (a phone
// flapping at the edge can't flood the website or the alerts feed).
export const MAX_SITE_EXITS_PER_SHIFT = 30;

// Left = this long outside before it counts (the phone holds the exit back
// until then; a return inside this window cancels it).
export const SITE_EXIT_DWELL_MS = 2 * 60 * 1000;
