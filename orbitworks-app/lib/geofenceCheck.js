import { getDb } from "./db";

// Geofencing (Pro) auto site detection - on-device, best-effort site
// detection against the sites_cache/sync_meta rows pinSync.js's
// syncPinTable() populates. There is no site picker anymore once a
// company has any located site at all (see hasLocatedSites below) - the
// app has to find the matching site itself, the same way the server does.
//
// This exists purely to populate the optimistic queued event before it
// syncs. It is never trusted as the authoritative record: the saved
// event's real siteId/geofenceStatus is always recomputed server-side
// once it syncs (onClockEventCreated), from the same raw lat/lng this
// device captured, independent of whatever this file concluded, and the
// client is blocked (firestore.rules) from ever writing those fields
// itself. Geofencing itself is always flag-only - nothing here ever
// blocks a clock-in or requires a reason.
//
// detectSiteLocal below is duplicated from functions/src/geofencing.ts's
// detectSite - same convention as isProPlan elsewhere in this app, since
// nothing can be imported across the app/functions package boundary.

// Mirrors functions/src/geofencing.ts's own copy (same cross-package
// duplication convention as isProPlan elsewhere) - the fallback "on site"
// radius for a located site that was never asked to save its own radius,
// because geofencing was never turned on for it.
const DEFAULT_SITE_RADIUS_METERS = 150;

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
    "SELECT key, value FROM sync_meta WHERE key IN ('isPro', 'hasLocatedSites')"
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    isPro: byKey.isPro === "1",
    hasLocatedSites: byKey.hasLocatedSites === "1",
  };
}

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
// detection.
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
