import { haversineMeters } from "./geocoding";

// Mirrors orbitworks-web/lib/geo.ts's own copy exactly (same cross-package
// duplication convention as isProPlan elsewhere) - the fallback "on site"
// radius for a site that has coordinates but was never asked to save its
// own radius, because geofencing was never turned on for it.
const DEFAULT_SITE_RADIUS_METERS = 150;

// Geofencing (Pro) - used by onClockEventCreated for after-the-fact record
// labeling (see clockEvents.ts): every clock-in is always allowed through,
// just classified/flagged as inside or outside the fence.
//
// Never trust a classification the client sent - only ever compute it
// here, from the raw lat/lng and the site's own stored location/radius.

export interface GeofenceSite {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  requireGeofence?: boolean;
}

export type GeofenceStatus = "inside" | "outside";

export interface GeofenceClassification {
  // False when the site isn't geofenced (or has no lat/lng/radius yet) -
  // callers should save no geofence info at all in that case, per spec.
  applicable: boolean;
  status: GeofenceStatus | null;
  distanceM: number | null;
}

// Location denied/unavailable is treated as outside (per spec) whenever
// the site IS geofenced - that's the only way "no signal" can't become a
// way around the geofence. distanceM is null in that case; there's
// nothing to measure.
export function classifyGeofence(
  location: { lat: number; lng: number } | null,
  accuracyM: number | null,
  site: GeofenceSite | null | undefined
): GeofenceClassification {
  if (
    !site ||
    !site.requireGeofence ||
    typeof site.lat !== "number" ||
    typeof site.lng !== "number" ||
    typeof site.radiusMeters !== "number"
  ) {
    return { applicable: false, status: null, distanceM: null };
  }

  if (!location) {
    return { applicable: true, status: "outside", distanceM: null };
  }

  const distanceM = haversineMeters(location.lat, location.lng, site.lat, site.lng);
  // Accuracy counts in the worker's favor: if the accuracy circle touches
  // the fence at all, count it as inside.
  const effectiveDistanceM = accuracyM != null ? Math.max(0, distanceM - accuracyM) : distanceM;
  const status: GeofenceStatus = effectiveDistanceM <= site.radiusMeters ? "inside" : "outside";
  return { applicable: true, status, distanceM: Math.round(distanceM) };
}

// Auto-detection + hybrid checking - a site is now "detected" (not picked
// by the client) whenever the company has at least one active site with
// saved coordinates. Geofencing (requireGeofence) no longer gates whether
// a site CAN be matched - only whether being outside it should ever
// block/flag anything is still opt-in per site (see clockEvents.ts, which
// runs this twice: once over every located site for attribution, and
// separately over just the geofenced ones for the enforcement-flavored
// geofenceStatus/alert). A site with no saved lat/lng at all (address
// typed but never picked from the autocomplete suggestions) is the only
// case still invisible here.
export interface DetectableSite extends GeofenceSite {
  id: string;
  name: string;
  active?: boolean;
}

export interface SiteDetectionResult {
  // False when there were no candidate sites at all (no active site with
  // coordinates in whatever list the caller passed in) - callers must
  // leave whatever site the client already had completely alone in that
  // case ("keep today's flow exactly as is").
  hasCandidates: boolean;
  // The detected site, or null when the location isn't within any
  // candidate's radius (including when there's no location at all - "no
  // signal" resolves to outside, same as classifyGeofence above, never a
  // way to dodge detection). Only meaningful when hasCandidates is true.
  siteId: string | null;
  siteName: string | null;
  status: GeofenceStatus | null;
  // Distance to the matched site when inside one, or to the single
  // closest candidate when outside all of them (for messaging) - null
  // only when hasCandidates is false or there's no location to measure
  // from.
  distanceM: number | null;
  // The closest candidate's name for messaging (e.g. "You're 2.3 mi from
  // Riverside Build"), even when status is "outside" and siteId/siteName
  // above are null because nothing was close enough to assign. Same as
  // siteName when status is "inside".
  nearestSiteName: string | null;
}

export function detectSite(
  location: { lat: number; lng: number } | null,
  accuracyM: number | null,
  candidateSites: DetectableSite[]
): SiteDetectionResult {
  const located = candidateSites.filter(
    (s) => s.active !== false && typeof s.lat === "number" && typeof s.lng === "number"
  );

  if (located.length === 0) {
    return {
      hasCandidates: false,
      siteId: null,
      siteName: null,
      status: null,
      distanceM: null,
      nearestSiteName: null,
    };
  }

  if (!location) {
    return {
      hasCandidates: true,
      siteId: null,
      siteName: null,
      status: "outside",
      distanceM: null,
      nearestSiteName: null,
    };
  }

  const scored = located.map((site) => {
    const radiusMeters =
      typeof site.radiusMeters === "number" ? site.radiusMeters : DEFAULT_SITE_RADIUS_METERS;
    const distanceM = haversineMeters(location.lat, location.lng, site.lat!, site.lng!);
    const effectiveDistanceM = accuracyM != null ? Math.max(0, distanceM - accuracyM) : distanceM;
    return { site, distanceM, inside: effectiveDistanceM <= radiusMeters };
  });

  // Overlapping radii: the closest INSIDE match wins, not just the
  // closest site overall (a small fence nested inside a much larger one
  // could otherwise have the large site win purely on distance).
  const insideMatches = scored.filter((m) => m.inside).sort((a, b) => a.distanceM - b.distanceM);
  if (insideMatches.length > 0) {
    const match = insideMatches[0];
    return {
      hasCandidates: true,
      siteId: match.site.id,
      siteName: match.site.name,
      status: "inside",
      distanceM: Math.round(match.distanceM),
      nearestSiteName: match.site.name,
    };
  }

  const closest = scored.sort((a, b) => a.distanceM - b.distanceM)[0];
  return {
    hasCandidates: true,
    siteId: null,
    siteName: null,
    nearestSiteName: closest.site.name,
    status: "outside",
    distanceM: Math.round(closest.distanceM),
  };
}

// ---- Clock-in site detection, shared by both apps ----
//
// ONE place for "which site is this clock-in at": the supervisor app's pin
// clock-in (onClockEventCreated, after the write) and the Employee App's
// clock-in (employeeClockPunch, before the write - Phase 6) both call
// loadDetectableSites + detectClockInSite. What each one does with "no
// match" differs and stays with the caller: the supervisor app saves no
// site; the Employee App keeps its Phase 3 site (pickEmployeeClockInSite).

// Every active job site, as detection candidates. A site with no saved
// coordinates is filtered out by detectSite itself.
export async function loadDetectableSites(
  jobSitesRef: FirebaseFirestore.CollectionReference
): Promise<DetectableSite[]> {
  const snap = await jobSitesRef.where("active", "==", true).get();
  return snap.docs.map((d) => {
    const s = d.data() as { name?: string; lat?: number; lng?: number; radiusMeters?: number; requireGeofence?: boolean };
    return {
      id: d.id,
      name: s.name ?? "",
      lat: s.lat,
      lng: s.lng,
      radiusMeters: s.radiusMeters,
      requireGeofence: s.requireGeofence === true,
      active: true,
    };
  });
}

export interface ClockInDetection {
  // False = no active located site at all: callers keep the site they had.
  hasCandidates: boolean;
  // The matched site, or null when the fix is inside none of them.
  siteId: string | null;
  siteName: string | null;
  // The "outside geofence" badge/alert input for this clock-in.
  geofence: GeofenceClassification;
}

// Attribution over every located site, then the geofence result: a
// matched site is "inside" only when THAT site is geofenced (a matched
// unfenced site shows nothing); no match falls back to a fenced-only check
// so someone nowhere near a fenced site is still flagged "outside".
export function detectClockInSite(
  location: { lat: number; lng: number } | null,
  accuracyM: number | null,
  candidates: DetectableSite[]
): ClockInDetection {
  const none: GeofenceClassification = { applicable: false, status: null, distanceM: null };
  const attribution = detectSite(location, accuracyM, candidates);
  if (!attribution.hasCandidates) {
    return { hasCandidates: false, siteId: null, siteName: null, geofence: none };
  }
  if (attribution.siteId) {
    const matched = candidates.find((c) => c.id === attribution.siteId);
    const geofence: GeofenceClassification = matched?.requireGeofence
      ? { applicable: true, status: "inside", distanceM: attribution.distanceM }
      : none;
    return { hasCandidates: true, siteId: attribution.siteId, siteName: attribution.siteName, geofence };
  }
  const fenceCheck = detectSite(location, accuracyM, candidates.filter((c) => c.requireGeofence));
  const geofence: GeofenceClassification = fenceCheck.hasCandidates
    ? { applicable: true, status: fenceCheck.status, distanceM: fenceCheck.distanceM }
    : none;
  return { hasCandidates: true, siteId: null, siteName: null, geofence };
}

// Employee App (Pro) only: a fix less accurate than this (or with no
// accuracy at all) is too rough to pick a site from - the Phase 3 site is
// used instead. The fix is still saved for display.
export const DETECTION_MAX_ACCURACY_M = 500;

export function isAccurateEnoughToDetect(accuracyM: number | null | undefined): boolean {
  return typeof accuracyM === "number" && accuracyM <= DETECTION_MAX_ACCURACY_M;
}

// Employee App clock-in: inside a site = the detected site wins; else the
// Phase 3 site (crew code site -> single assigned site -> none).
export function pickEmployeeClockInSite(
  detection: ClockInDetection | null,
  phase3Site: { siteId: string | null; siteName: string }
): { siteId: string | null; siteName: string; autoDetected: boolean } {
  if (detection && detection.siteId) {
    return { siteId: detection.siteId, siteName: detection.siteName ?? "", autoDetected: true };
  }
  return { siteId: phase3Site.siteId, siteName: phase3Site.siteName, autoDetected: false };
}

export function formatGeofenceDistance(meters: number): string {
  const feet = meters / 0.3048;
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}
