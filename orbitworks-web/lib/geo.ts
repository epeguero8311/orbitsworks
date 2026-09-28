// Pure location math and classification - no React, no Firebase. Types for
// this module's inputs/outputs live in lib/types.ts per project convention.

import type { AccuracyInfo, JobSite, SiteProximityInfo } from "@/lib/types";

// Matches the JobSite.radiusMeters doc comment - used whenever a site
// exists but hasn't had a radius explicitly set.
export const DEFAULT_SITE_RADIUS_METERS = 150;

// Geofence radius unit conversions and bounds, for the Sites geofence
// toggle (lib/validators/site.ts, SitesSection.tsx). radiusMeters on
// JobSite stays the source of truth for distance math; ft/mi are only
// ever the admin-facing input/display unit.
const METERS_PER_FOOT = 0.3048;
const FEET_PER_MILE = 5280;

export function feetToMeters(feet: number): number {
  return feet * METERS_PER_FOOT;
}

export function milesToMeters(miles: number): number {
  return miles * FEET_PER_MILE * METERS_PER_FOOT;
}

export function metersToFeet(meters: number): number {
  return meters / METERS_PER_FOOT;
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_FOOT / FEET_PER_MILE;
}

export const MIN_GEOFENCE_RADIUS_METERS = feetToMeters(100);
export const MAX_GEOFENCE_RADIUS_METERS = milesToMeters(5);
export const DEFAULT_GEOFENCE_RADIUS_FT = 500;

// Renders a site's saved radius back in whichever unit it was set in,
// e.g. "500 ft" / "0.5 mi" - unit falls back to ft for sites that somehow
// have a radius but no stored unit.
export function formatGeofenceRadius(radiusMeters: number, unit: "ft" | "mi" | undefined): string {
  if (unit === "mi") {
    const miles = metersToMiles(radiusMeters);
    return `${parseFloat(miles.toFixed(2))} mi`;
  }
  return `${Math.round(metersToFeet(radiusMeters))} ft`;
}

// Inverse of the above, for pre-filling the Add/Edit form's radius input
// from a saved site - unset sites (no radiusMeters yet) get the same
// default the Add form starts with.
export function radiusInputFromSite(site: JobSite): { value: string; unit: "ft" | "mi" } {
  const unit = site.radiusUnit ?? "ft";
  if (site.radiusMeters == null) {
    return { value: String(DEFAULT_GEOFENCE_RADIUS_FT), unit: "ft" };
  }
  const value = unit === "mi" ? metersToMiles(site.radiusMeters) : metersToFeet(site.radiusMeters);
  return { value: String(Math.round(value * 100) / 100), unit };
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

// ft/mi distance formatting for geofence violations (Part 3/4) - matches
// functions/src/geofencing.ts's formatGeofenceDistance exactly (duplicated
// there, same cross-package convention as isProPlan elsewhere in this
// codebase) so the "2.3 mi" the admin sees in a log badge, detail view, or
// alert always matches what the server's denial message said.
export function formatGeofenceDistance(meters: number): string {
  const feet = meters / METERS_PER_FOOT;
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = meters / (METERS_PER_FOOT * FEET_PER_MILE);
  return `${miles.toFixed(1)} mi`;
}

export function classifyAccuracy(accuracyMeters: number): AccuracyInfo {
  const rounded = Math.round(accuracyMeters);
  if (accuracyMeters <= 20) {
    return { tier: "high", label: `GPS accuracy: High (±${rounded} m)` };
  }
  if (accuracyMeters <= 100) {
    return { tier: "medium", label: `GPS accuracy: Medium (±${rounded} m)` };
  }
  return { tier: "low", label: `GPS accuracy: Low (±${rounded} m)` };
}

// distanceMeters/siteName are null/undefined whenever there's nothing to
// compare against (no site on the event, or the site has no coordinates) -
// that's the only case that resolves to "unknown", regardless of radius.
export function classifySiteProximity(
  distanceMeters: number | null,
  siteName: string | null | undefined,
  radiusMeters: number = DEFAULT_SITE_RADIUS_METERS
): SiteProximityInfo {
  if (distanceMeters == null || !siteName) {
    return { tier: "unknown", label: "No site to compare" };
  }

  const rounded = Math.round(distanceMeters);
  if (distanceMeters <= radiusMeters) {
    return { tier: "on", label: `On site - ${siteName} (${rounded} m away)` };
  }
  if (distanceMeters <= radiusMeters * 2) {
    return { tier: "near", label: `Near site - ${rounded} m from ${siteName}` };
  }
  return { tier: "off", label: `Off site - ${formatDistance(distanceMeters)} from ${siteName}` };
}

// True only when the GPS fix is loose enough, relative to this site's own
// radius, that "on site" can't actually be trusted - e.g. a 200m accuracy
// circle against a 150m radius could really be anywhere from on-site to
// well outside it.
export function isAccuracyTooLowForSite(accuracyMeters: number, radiusMeters: number): boolean {
  return accuracyMeters > radiusMeters;
}

const OSM_EMBED_DELTA_DEG = 0.002;

export function buildOsmEmbedUrl(lat: number, lng: number): string {
  const minLat = lat - OSM_EMBED_DELTA_DEG;
  const maxLat = lat + OSM_EMBED_DELTA_DEG;
  const minLng = lng - OSM_EMBED_DELTA_DEG;
  const maxLng = lng + OSM_EMBED_DELTA_DEG;
  return (
    "https://www.openstreetmap.org/export/embed.html" +
    `?bbox=${minLng},${minLat},${maxLng},${maxLat}` +
    "&layer=mapnik" +
    `&marker=${lat},${lng}`
  );
}

export function buildGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// For sites with no lat/lng yet (Core plan, or an address that hasn't
// been geocoded) - same q= pattern as buildGoogleMapsUrl, just a text
// query instead of coordinates.
export function buildGoogleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}`;
}
