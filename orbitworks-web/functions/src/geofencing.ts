import { haversineMeters } from "./geocoding";

// Geofencing (Pro) Part 3 - shared between onClockEventCreated (async,
// after-the-fact record labeling - see clockEvents.ts) and
// redeemTempClockLink (synchronous, before-the-write enforcement - see
// tempClockLinks.ts). Kept here so those two entry points can never
// disagree about what "inside"/"outside" or a denial message means.
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

// Auto-detection + hybrid checking - a site is now "detected" (not
// picked by the client) whenever the company has at least one fenced,
// active site. Only geofenced sites are ever candidates - a non-fenced
// site is invisible to this function entirely (per spec, "only sites
// with a fence can be auto-detected").
export interface DetectableSite extends GeofenceSite {
  id: string;
  name: string;
  active?: boolean;
}

export interface SiteDetectionResult {
  // False when the company has no fenced+active sites at all - callers
  // must leave whatever site the client already had completely alone in
  // that case ("keep today's flow exactly as is" for those companies).
  hasFencedSites: boolean;
  // The detected site, or null when the location isn't inside any fence
  // (including when there's no location at all - "no signal" resolves to
  // outside, same as classifyGeofence above, never a way to dodge
  // detection). Only meaningful when hasFencedSites is true.
  siteId: string | null;
  siteName: string | null;
  status: GeofenceStatus | null;
  // Distance to the matched site when inside one, or to the single
  // closest fenced site when outside all of them (for messaging) - null
  // only when hasFencedSites is false or there's no location to measure
  // from.
  distanceM: number | null;
  // The closest fenced site's name for messaging (e.g. "You're 2.3 mi
  // from Riverside Build"), even when status is "outside" and siteId/
  // siteName above are null because nothing was close enough to assign.
  // Same as siteName when status is "inside".
  nearestSiteName: string | null;
}

export function detectSite(
  location: { lat: number; lng: number } | null,
  accuracyM: number | null,
  candidateSites: DetectableSite[]
): SiteDetectionResult {
  const fenced = candidateSites.filter(
    (s) =>
      s.active !== false &&
      s.requireGeofence &&
      typeof s.lat === "number" &&
      typeof s.lng === "number" &&
      typeof s.radiusMeters === "number"
  );

  if (fenced.length === 0) {
    return {
      hasFencedSites: false,
      siteId: null,
      siteName: null,
      status: null,
      distanceM: null,
      nearestSiteName: null,
    };
  }

  if (!location) {
    return {
      hasFencedSites: true,
      siteId: null,
      siteName: null,
      status: "outside",
      distanceM: null,
      nearestSiteName: null,
    };
  }

  const scored = fenced.map((site) => {
    const distanceM = haversineMeters(location.lat, location.lng, site.lat!, site.lng!);
    const effectiveDistanceM = accuracyM != null ? Math.max(0, distanceM - accuracyM) : distanceM;
    return { site, distanceM, inside: effectiveDistanceM <= site.radiusMeters! };
  });

  // Overlapping fences: the closest INSIDE match wins, not just the
  // closest site overall (a small fence nested inside a much larger one
  // could otherwise have the large site win purely on distance).
  const insideMatches = scored.filter((m) => m.inside).sort((a, b) => a.distanceM - b.distanceM);
  if (insideMatches.length > 0) {
    const match = insideMatches[0];
    return {
      hasFencedSites: true,
      siteId: match.site.id,
      siteName: match.site.name,
      status: "inside",
      distanceM: Math.round(match.distanceM),
      nearestSiteName: match.site.name,
    };
  }

  const closest = scored.sort((a, b) => a.distanceM - b.distanceM)[0];
  return {
    hasFencedSites: true,
    siteId: null,
    siteName: null,
    nearestSiteName: closest.site.name,
    status: "outside",
    distanceM: Math.round(closest.distanceM),
  };
}

export function formatGeofenceDistance(meters: number): string {
  const feet = meters / 0.3048;
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}

export type EnforcementMode = "flag" | "requireReason" | "block";

export interface EnforcementResult {
  allowed: boolean;
  requiresReason: boolean;
  // Set whenever allowed is false, or requiresReason is true and no
  // reason was given yet - callers append their own surface-specific
  // suffix (e.g. the temp link's "Ask your supervisor to clock you in.").
  denialMessage?: string;
}

// Only meaningful for status === "outside" - callers should skip this
// entirely (allowed: true) when classifyGeofence/detectSite found the
// worker inside, or when the site isn't geofenced at all. siteName is
// null when auto-detection didn't land inside any fence at all (no
// single site to name in the message).
export function evaluateEnforcement({
  distanceM,
  mode,
  siteName,
  hasReason,
}: {
  distanceM: number | null;
  mode: EnforcementMode;
  siteName: string | null;
  hasReason: boolean;
}): EnforcementResult {
  const distancePhrase =
    distanceM != null && siteName
      ? `You're ${formatGeofenceDistance(distanceM)} from ${siteName}.`
      : distanceM != null
        ? `You're ${formatGeofenceDistance(distanceM)} from the nearest job site.`
        : siteName
          ? `We couldn't confirm your location near ${siteName}.`
          : "We couldn't confirm your location near a job site.";

  if (mode === "flag") {
    return { allowed: true, requiresReason: false };
  }
  if (mode === "requireReason") {
    return {
      allowed: hasReason,
      requiresReason: true,
      denialMessage: hasReason ? undefined : "A reason is required to clock in from this location.",
    };
  }
  return { allowed: false, requiresReason: false, denialMessage: distancePhrase };
}
