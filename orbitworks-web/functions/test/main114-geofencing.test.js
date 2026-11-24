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
