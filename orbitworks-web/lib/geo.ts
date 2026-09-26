// Pure location math and classification - no React, no Firebase. Types for
// this module's inputs/outputs live in lib/types.ts per project convention.

import type { AccuracyInfo, SiteProximityInfo } from "@/lib/types";

// Matches the JobSite.radiusMeters doc comment - used whenever a site
// exists but hasn't had a radius explicitly set.
export const DEFAULT_SITE_RADIUS_METERS = 150;

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
