import { getDb } from "./db";

// Geofencing (Pro) auto site detection + hybrid checking - on-device,
// best-effort site detection against the sites_cache/sync_meta rows
// pinSync.js's syncPinTable() populates. There is no site picker anymore
// once a company has any fenced site at all (see hasFencedSites below) -
// the app has to find the matching site itself, the same way the server
// does.
//
// This exists purely to drive the immediate clock-in UX (which screen to
// show, Block/Require-reason modes only - "Flag mode does no check" per
// spec, since nothing here can ever block or require a reason in that
// mode anyway) with no signal at all. It is never trusted as the
// authoritative record: the saved event's real siteId/geofenceStatus is
// always recomputed server-side once it syncs (onClockEventCreated), from
// the same raw lat/lng this device captured, independent of whatever this
// file concluded, and the client is blocked (firestore.rules) from ever
// writing those fields itself.
//
// detectSiteLocal below is duplicated from functions/src/geofencing.ts's
// detectSite - same convention as isProPlan elsewhere in this app, since
// nothing can be imported across the app/functions package boundary.

const METERS_PER_FOOT = 0.3048;

// Mirrors functions/src/geofencing.ts's own copy (same cross-package
// duplication convention as isProPlan elsewhere) - the fallback "on site"
// radius for a located site that was never asked to save its own radius,
// because geofencing was never turned on for it.
const DEFAULT_SITE_RADIUS_METERS = 150;

function formatDistance(meters) {
  const feet = meters / METERS_PER_FOOT;
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// location null (denied/unavailable) is treated as outside every
// candidate site, same as the server-side version - "no signal" must not
// become a way around the geofence. Mirrors detectSite's own
// overlapping-radius rule: the closest INSIDE match wins, not just the
// closest site overall. radiusMeters falls back to
// DEFAULT_SITE_RADIUS_METERS for a site that was never asked to save one.
function detectSiteLocal(location, accuracyM, sites) {
  if (!location) {
    return { status: "outside", distanceM: null, siteId: null, siteName: null };
  }

  const scored = sites.map((site) => {
    const radiusMeters = site.radiusMeters != null ? site.radiusMeters : DEFAULT_SITE_RADIUS_METERS;
    const distanceM = haversineMeters(location.lat, location.lng, site.lat, site.lng);
    const effectiveDistanceM = accuracyM != null ? Math.max(0, distanceM - accuracyM) : distanceM;
    return { site, distanceM, inside: effectiveDistanceM <= radiusMeters };
  });

  const insideMatches = scored.filter((m) => m.inside).sort((a, b) => a.distanceM - b.distanceM);
  if (insideMatches.length > 0) {
    const match = insideMatches[0];
    return {
      status: "inside",
      distanceM: Math.round(match.distanceM),
      siteId: match.site.siteId,
      siteName: match.site.name,
    };
  }

  const closest = scored.sort((a, b) => a.distanceM - b.distanceM)[0];
  return {
    status: "outside",
    distanceM: Math.round(closest.distanceM),
    siteId: null,
    siteName: null,
  };
}

async function getCachedSettings() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT key, value FROM sync_meta WHERE key IN ('isPro', 'geofenceEnforcementMode', 'hasFencedSites', 'hasLocatedSites')"
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    isPro: byKey.isPro === "1",
    enforcementMode: byKey.geofenceEnforcementMode || "flag",
    hasFencedSites: byKey.hasFencedSites === "1",
    hasLocatedSites: byKey.hasLocatedSites === "1",
  };
}

async function getCachedFencedSites() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM sites_cache
     WHERE active = 1 AND requireGeofence = 1 AND lat IS NOT NULL AND lng IS NOT NULL AND radiusMeters IS NOT NULL`
  );
}

// Broader than getCachedFencedSites above - every active, located site,
// geofenced or not (Geofencing Part 5: requireGeofence gates enforcement
// only, not whether a site can be matched at all).
async function getCachedLocatedSites() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM sites_cache WHERE active = 1 AND lat IS NOT NULL AND lng IS NOT NULL`
  );
}

// True only when this device should skip its site picker and attempt
// attribution instead - a Pro company with at least one active, located
// site (fenced or not). ClockCameraScreen checks this before deciding
// whether to use SiteSessionContext's selectedSite (today's flow) or
// detection. Enforcement (block/require-reason) is a separate, narrower
// gate - see checkGeofenceForClockIn below.
export async function isAutoDetectionActive() {
  const settings = await getCachedSettings();
  return settings.isPro && settings.hasLocatedSites;
}

// This device's own best-effort guess at which site a clock-in is at,
// across every located site (not just geofenced ones) - purely to
// populate the optimistic queued event before it syncs; the server's own
// detectSite always has the final say (see this file's header comment).
// Returns { siteId: null, siteName: "Not specified" } when nothing is
// close enough to any candidate, or there's no location signal at all.
export async function detectLocalSite(location, accuracyM) {
  const sites = await getCachedLocatedSites();
  if (sites.length === 0) return { siteId: null, siteName: "Not specified" };

  const { siteId, siteName } = detectSiteLocal(location, accuracyM, sites);
  return { siteId, siteName: siteName || "Not specified" };
}

// "Ask for job site each time" (App Settings on the website) - the list
// ClockCameraScreen's forced site picker offers for a given employee:
// their own assigned sites when they have any, otherwise every active
// company site (so there's always something to pick from).
export async function getSitesForEmployeePicker(employee) {
  const db = await getDb();
  const ids = employee?.assignedSiteIds || [];
  const rows =
    ids.length > 0
      ? await db.getAllAsync(
          `SELECT * FROM sites_cache WHERE active = 1 AND siteId IN (${ids.map(() => "?").join(",")}) ORDER BY name`,
          ids
        )
      : await db.getAllAsync(`SELECT * FROM sites_cache WHERE active = 1 ORDER BY name`);
  return rows.map((row) => ({ id: row.siteId, name: row.name }));
}

// Returns { applicable: false } for anything not subject to on-device
// checking at all: Core plan, a Pro company with no fenced sites ("keep
// today's flow exactly"), or Flag mode (which never blocks or requires a
// reason, so there's nothing for this check to decide - the server still
// detects the site and flags the event asynchronously either way).
//
// Otherwise returns:
//   { applicable: true, status, distanceM, mode, siteId, siteName,
//     action: "proceed" | "requireReason" | "block", message? }
// siteId/siteName are this device's own best-effort detected site (or
// null when nothing matched) - purely to populate the optimistic queued
// event; the server may still correct it once the event syncs.
export async function checkGeofenceForClockIn({ location, locationAccuracyM }) {
  const settings = await getCachedSettings();
  if (!settings.isPro || !settings.hasFencedSites) return { applicable: false };
  if (settings.enforcementMode === "flag") return { applicable: false };

  const sites = await getCachedFencedSites();
  if (sites.length === 0) return { applicable: false };

  const { status, distanceM, siteId, siteName } = detectSiteLocal(location, locationAccuracyM, sites);
  const mode = settings.enforcementMode;

  if (status === "inside") {
    return { applicable: true, status, distanceM, mode, siteId, siteName, action: "proceed" };
  }

  if (mode === "requireReason") {
    return { applicable: true, status, distanceM, mode, siteId, siteName, action: "requireReason" };
  }

  const message =
    distanceM != null
      ? `You're ${formatDistance(distanceM)} from the nearest job site.`
      : "We couldn't confirm your location near a job site.";
  return { applicable: true, status, distanceM, mode, siteId, siteName, action: "block", message };
}
