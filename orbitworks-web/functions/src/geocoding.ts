import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { db } from "./shared";

// Bind into the `secrets` array of any function that geocodes, e.g.
// `onCall({ secrets: [MAPBOX_TOKEN] }, ...)`.
export const MAPBOX_TOKEN = defineSecret("MAPBOX_TOKEN");

// Duplicated from lib/stripe/tiers.ts's isProPlan (can't import across the
// functions/web package boundary) - same convention tempClockLinks.ts
// already uses.
function isProPlan(planTier: string | undefined | null): boolean {
  return !!planTier && planTier.startsWith("pro_");
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

// Caps how long a stalled Mapbox request can hold up a function
// invocation - a hung external call shouldn't eat into the same budget
// as the rest of onClockEventCreated's work (or, for geocodeJobSiteAddress,
// leave an admin's "Add site" click spinning indefinitely).
const FETCH_TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Rounds to a ~11m grid cell. Most clock-ins cluster at the same handful
// of job sites, so caching the resolved address by grid cell (rather than
// keying it to a specific event, or to the site) turns "one Mapbox call
// per clock-in" into "one call per distinct place employees actually
// clock in from" - a large, unbounded, top-level collection is fine here
// since it never needs a query, only doc(key) gets/sets.
const CACHE_PRECISION = 4;
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(CACHE_PRECISION)}_${lng.toFixed(CACHE_PRECISION)}`;
}

// Best-effort only - every failure path (missing token, network error,
// no result) returns null rather than throwing, so a lookup failure never
// blocks the clock event write it's enriching. Caller decides what "no
// address" means for display (still show lat/lng + map link).
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = cacheKey(lat, lng);
  const cacheRef = db.collection("geocodeCache").doc(key);

  const cached = await cacheRef.get().catch(() => null);
  if (cached?.exists) {
    return (cached.data()?.address as string | undefined) ?? null;
  }

  const token = MAPBOX_TOKEN.value();
  if (!token) return null;

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=address&limit=1`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: Array<{ place_name?: string }> };
    const address = json.features?.[0]?.place_name ?? null;
    if (address) {
      await cacheRef
        .set({ lat, lng, address, createdAt: admin.firestore.FieldValue.serverTimestamp() })
        .catch((err) => console.error("Failed to cache reverse geocode", key, err));
    }
    return address;
  } catch (err) {
    console.error("Reverse geocode failed", lat, lng, err);
    return null;
  }
}

async function forwardGeocode(
  address: string
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  const token = MAPBOX_TOKEN.value();
  if (!token) return null;

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      address
    )}.json?access_token=${token}&limit=1`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{ center?: [number, number]; place_name?: string }>;
    };
    const feature = json.features?.[0];
    if (!feature?.center) return null;
    const [lng, lat] = feature.center;
    return { lat, lng, formattedAddress: feature.place_name ?? address };
  } catch (err) {
    console.error("Forward geocode failed", address, err);
    return null;
  }
}

// Admin/owner-only, Pro-gated (same pattern as generateTempClockLink) -
// Core companies never trigger a paid Mapbox call. Called from
// useSites.ts when an admin adds/edits a site's address; the client then
// writes the returned lat/lng onto the jobSite doc itself (that write
// already goes straight through firestore.rules, same as every other
// jobSites field).
export const geocodeJobSiteAddress = onCall({ secrets: [MAPBOX_TOKEN] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const companySnap = await db.collection("companies").doc(callerCompanyId).get();
  const planTier = companySnap.data()?.planTier as string | undefined;
  if (!isProPlan(planTier)) {
    throw new HttpsError("permission-denied", "Job site locations require the Pro plan.");
  }

  const address = (request.data?.address ? String(request.data.address) : "").trim();
  if (!address) {
    throw new HttpsError("invalid-argument", "address is required.");
  }

  const result = await forwardGeocode(address);
  if (!result) {
    return { found: false };
  }
  return { found: true, lat: result.lat, lng: result.lng, formattedAddress: result.formattedAddress };
});
