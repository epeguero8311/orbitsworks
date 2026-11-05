// Unit tests for geofencing.ts's detectSite (Geofencing Part 5: detection
// compares every active, located site - not just ones with geofencing
// explicitly enabled; requireGeofence is purely an enforcement/alert flag,
// never a detection filter). Pure logic, no Firestore emulator needed -
// see alerts.test.js/rules.test.js for the trigger-level tests that do.
const test = require("node:test");
const assert = require("node:assert/strict");
const { detectSite, classifyGeofence } = require("../lib/geofencing.js");

const HOME = { id: "home", name: "Home", lat: 29.9946, lng: -90.2417, requireGeofence: false, active: true };
const XULA = {
  id: "xula",
  name: "Xula",
  lat: 29.95,
  lng: -90.07,
  radiusMeters: 100,
  requireGeofence: true,
  active: true,
};

test("detectSite matches a non-geofenced site within the default radius", () => {
  // Same point as Home - well within the default 150m fallback radius
  // even though Home never had a radiusMeters value saved.
  const result = detectSite({ lat: 29.9946, lng: -90.2417 }, 10, [HOME, XULA]);
  assert.equal(result.hasCandidates, true);
  assert.equal(result.siteId, "home");
  assert.equal(result.status, "inside");
});

test("detectSite does not match a non-geofenced site far outside the default radius", () => {
  const result = detectSite({ lat: 30.5, lng: -91.0 }, 10, [HOME, XULA]);
  assert.equal(result.hasCandidates, true);
  assert.equal(result.siteId, null);
  assert.equal(result.status, "outside");
});

test("detectSite still matches a geofenced site using its own saved radius, not the default", () => {
  const result = detectSite({ lat: 29.95, lng: -90.07 }, 5, [HOME, XULA]);
  assert.equal(result.siteId, "xula");
  assert.equal(result.status, "inside");
});

test("detectSite returns hasCandidates: false when no site has coordinates at all", () => {
  const noCoords = { id: "legacy", name: "Legacy", active: true };
  const result = detectSite({ lat: 29.9946, lng: -90.2417 }, 10, [noCoords]);
  assert.equal(result.hasCandidates, false);
  assert.equal(result.siteId, null);
});

test("classifyGeofence is unaffected: still only applicable for a requireGeofence site", () => {
  const result = classifyGeofence({ lat: 29.9946, lng: -90.2417 }, 10, HOME);
  assert.equal(result.applicable, false);
});

// ---- Phase 6: shared clock-in detection + Employee App pick ----
const {
  detectClockInSite,
  pickEmployeeClockInSite,
  isAccurateEnoughToDetect,
  DETECTION_MAX_ACCURACY_M,
} = require("../lib/geofencing.js");

const PHASE3 = { siteId: "crew", siteName: "Crew Site" };
// Two overlapping sites: a big one and a small one inside it.
const BIG = { id: "big", name: "Big", lat: 29.95, lng: -90.07, radiusMeters: 2000, requireGeofence: false, active: true };
const SMALL = { id: "small", name: "Small", lat: 29.951, lng: -90.07, radiusMeters: 100, requireGeofence: true, active: true };

test("detectClockInSite: inside a fenced site = that site, geofence inside", () => {
  const d = detectClockInSite({ lat: 29.95, lng: -90.07 }, 5, [XULA]);
  assert.equal(d.siteId, "xula");
  assert.deepEqual(d.geofence.status, "inside");
  assert.equal(d.geofence.applicable, true);
});

test("detectClockInSite: inside an unfenced site = that site, no geofence badge", () => {
  const d = detectClockInSite({ lat: 29.9946, lng: -90.2417 }, 5, [HOME, XULA]);
  assert.equal(d.siteId, "home");
  assert.equal(d.geofence.applicable, false);
});

test("detectClockInSite: outside everything = no site, fenced-only check says outside", () => {
  const d = detectClockInSite({ lat: 30.5, lng: -91 }, 5, [HOME, XULA]);
  assert.equal(d.hasCandidates, true);
  assert.equal(d.siteId, null);
  assert.equal(d.geofence.status, "outside");
});

test("detectClockInSite: no located sites = no candidates", () => {
  const d = detectClockInSite({ lat: 29.95, lng: -90.07 }, 5, [{ id: "x", name: "X", active: true }]);
  assert.equal(d.hasCandidates, false);
  assert.equal(d.geofence.applicable, false);
});

test("detectClockInSite: overlapping sites = closest inside wins", () => {
  const d = detectClockInSite({ lat: 29.951, lng: -90.07 }, 5, [BIG, SMALL]);
  assert.equal(d.siteId, "small");
});

test("detectClockInSite: accuracy counts in the worker's favor", () => {
  // ~111 m from Xula's center, radius 100: outside at 5 m accuracy, inside at 20 m.
  assert.equal(detectClockInSite({ lat: 29.951, lng: -90.07 }, 5, [XULA]).siteId, null);
  assert.equal(detectClockInSite({ lat: 29.951, lng: -90.07 }, 20, [XULA]).siteId, "xula");
});

test("pickEmployeeClockInSite: detected wins, else the Phase 3 site", () => {
  const inside = detectClockInSite({ lat: 29.95, lng: -90.07 }, 5, [XULA]);
  assert.deepEqual(pickEmployeeClockInSite(inside, PHASE3), { siteId: "xula", siteName: "Xula", autoDetected: true });
  const outside = detectClockInSite({ lat: 30.5, lng: -91 }, 5, [XULA]);
  assert.deepEqual(pickEmployeeClockInSite(outside, PHASE3), { ...PHASE3, autoDetected: false });
  assert.deepEqual(pickEmployeeClockInSite(null, PHASE3), { ...PHASE3, autoDetected: false });
  const none = { siteId: null, siteName: "Not specified" };
  assert.deepEqual(pickEmployeeClockInSite(outside, none), { ...none, autoDetected: false });
});

test("isAccurateEnoughToDetect: up to 500 m; none or worse = skip detection", () => {
  assert.equal(isAccurateEnoughToDetect(0), true);
  assert.equal(isAccurateEnoughToDetect(DETECTION_MAX_ACCURACY_M), true);
  assert.equal(isAccurateEnoughToDetect(DETECTION_MAX_ACCURACY_M + 1), false);
  assert.equal(isAccurateEnoughToDetect(null), false);
  assert.equal(isAccurateEnoughToDetect(undefined), false);
});

const { isSiteMismatch } = require("../lib/geofencing.js");

test("isSiteMismatch: detected site outside the assigned list only", () => {
  assert.equal(isSiteMismatch("a", ["b"]), true);
  assert.equal(isSiteMismatch("a", ["a", "b"]), false);
  assert.equal(isSiteMismatch("a", []), false);
  assert.equal(isSiteMismatch("a", undefined), false);
  assert.equal(isSiteMismatch("a", "a"), false);
  assert.equal(isSiteMismatch(null, ["b"]), false);
});

// ---- Phase 8: leave tracking fence rule (mirrors the phone's copy) ----

const g8 = require("../lib/geofencing");
const FENCE8 = { lat: 30, lng: -97, radiusM: 100 };
const north = (m, accuracyM) => ({ lat: 30 + m / 111195, lng: -97, accuracyM });

test("fenceSide: inside / outside / unsure, same cases as the phone", () => {
  assert.equal(g8.fenceSide(north(0, 10), FENCE8), "inside");
  assert.equal(g8.fenceSide(north(150, 60), FENCE8), "inside");
  assert.equal(g8.fenceSide(north(120, 5), FENCE8), "unsure");
  assert.equal(g8.fenceSide(north(130, 5), FENCE8), "outside");
  assert.equal(g8.fenceSide(north(170, 60), FENCE8), "outside");
  assert.equal(g8.fenceSide(north(1000, 101), FENCE8), "unsure");
  assert.equal(g8.fenceSide(north(1000, null), FENCE8), "unsure");
  assert.equal(g8.fenceSide(null, FENCE8), "unsure");
  assert.equal(g8.fenceSide(north(1000, 5), null), "unsure");
});

test("fenceForSite: only a geofenced site with a place; a locked radius wins", () => {
  const site = { lat: 1, lng: 2, radiusMeters: 150, requireGeofence: true };
  assert.deepEqual(g8.fenceForSite(site), { lat: 1, lng: 2, radiusM: 150 });
  assert.deepEqual(g8.fenceForSite(site, 300), { lat: 1, lng: 2, radiusM: 300 });
  assert.equal(g8.fenceForSite({ ...site, requireGeofence: false }), null);
  assert.equal(g8.fenceForSite({ ...site, lat: undefined }), null);
  assert.equal(g8.fenceForSite({ ...site, radiusMeters: undefined }), null);
  assert.equal(g8.fenceForSite(undefined), null);
});
