// Employee App Phase 8 - leaving the job site: the fence rule and the
// recordSiteExit payload. CommonJS so test/siteExit.test.js runs in plain
// Node. Mirrors functions/src/geofencing.ts (fenceSide) and
// functions/src/siteExitValidators.ts - keep all three in sync by hand.
//
// A fix is { lat, lng, accuracyM, fixAtMs } (lib/validators/punchLocation.js).
// A fence is { lat, lng, radiusM } - the clock-in site, radius locked at
// clock-in.
//
// fenceSide:
//   "unsure"  - no fix, no accuracy, or accuracy worse than 100 m (never
//               changes anything)
//   "inside"  - distance - accuracy <= radius (accuracy in the worker's
//               favor, same as classifyGeofence)
//   "outside" - distance > radius + max(accuracy, 25 m)
//   between the two = "unsure" (the gap stops flapping at the edge)

const EXIT_MAX_ACCURACY_M = 100;
const EXIT_MIN_BUFFER_M = 25;
const SITE_EXIT_DWELL_MS = 2 * 60 * 1000;
const OFF_REASONS = ["permission", "signedOut", "appStopped"];

function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isFence(fence) {
  return !!fence && isNum(fence.lat) && isNum(fence.lng) && isNum(fence.radiusM) && fence.radiusM > 0;
}

function fenceSide(fix, fence) {
  if (!fix || !isFence(fence) || !isNum(fix.lat) || !isNum(fix.lng)) return "unsure";
  if (!isNum(fix.accuracyM) || fix.accuracyM < 0 || fix.accuracyM > EXIT_MAX_ACCURACY_M) return "unsure";
  const d = haversineMeters(fix.lat, fix.lng, fence.lat, fence.lng);
  if (d - fix.accuracyM <= fence.radiusM) return "inside";
  if (d > fence.radiusM + Math.max(fix.accuracyM, EXIT_MIN_BUFFER_M)) return "outside";
  return "unsure";
}

// Server fence { lat, lng, radiusM } -> fence, or null when anything is off.
function toFence(value) {
  if (!isFence(value)) return null;
  return { lat: value.lat, lng: value.lng, radiusM: value.radiusM };
}

// A site_exit_queue row -> the recordSiteExit input.
function toSiteExitPayload(row) {
  const payload = {
    exitId: row.exitId,
    clockInEventId: row.clockInEventId,
    kind: row.kind,
    phase: row.phase,
    atMs: Math.round(row.atMs),
  };
  if (isNum(row.lat) && isNum(row.lng) && isNum(row.fixAtMs)) {
    payload.location = {
      lat: row.lat,
      lng: row.lng,
      accuracyM: isNum(row.accuracyM) ? row.accuracyM : null,
      fixAtMs: Math.round(row.fixAtMs),
    };
  }
  if (row.kind === "trackingOff" && row.phase === "start") {
    payload.offReason = OFF_REASONS.includes(row.offReason) ? row.offReason : "appStopped";
  }
  return payload;
}

module.exports = {
  EXIT_MAX_ACCURACY_M,
  EXIT_MIN_BUFFER_M,
  SITE_EXIT_DWELL_MS,
  OFF_REASONS,
  haversineMeters,
  fenceSide,
  toFence,
  toSiteExitPayload,
};
