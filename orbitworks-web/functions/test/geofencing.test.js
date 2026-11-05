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

// ---- Phase 10 F1/F2: pickDetectedClockInSite (both apps) ----
const { pickDetectedClockInSite, geofenceForKeptSite, geofenceForDetectedSite, UNASSIGNED_DETECTION_MAX_ACCURACY_M } = require("../lib/geofencing.js");
const AT_XULA = { lat: 29.95, lng: -90.07 };
const FAR = { lat: 30.5, lng: -91 };

test("pick: good fix inside an UNASSIGNED site = that site (F1, D14 a)", () => {
  assert.deepEqual(pickDetectedClockInSite(AT_XULA, 5, [XULA, HOME], ["home"]), { kind: "detected", siteId: "xula", siteName: "Xula" });
  assert.deepEqual(pickDetectedClockInSite(AT_XULA, 100, [XULA], []), { kind: "detected", siteId: "xula", siteName: "Xula" }, "100 m is still good enough");
});

test("pick: good fix (100 m or better) inside no site = noMatch (Not specified)", () => {
  assert.deepEqual(pickDetectedClockInSite(FAR, 5, [XULA, HOME], ["xula"]), { kind: "noMatch" });
  assert.deepEqual(pickDetectedClockInSite(FAR, 100, [XULA], []), { kind: "noMatch" });
});

test("pick: 100-500 m fix matches ASSIGNED sites only; no assigned match = fallback (D18 b)", () => {
  assert.equal(UNASSIGNED_DETECTION_MAX_ACCURACY_M, 100);
  assert.deepEqual(pickDetectedClockInSite(AT_XULA, 101, [XULA], ["xula"]), { kind: "detected", siteId: "xula", siteName: "Xula" });
  assert.deepEqual(pickDetectedClockInSite(AT_XULA, 300, [XULA], ["home"]), { kind: "fallback" }, "unassigned site not trusted at 300 m");
  assert.deepEqual(pickDetectedClockInSite(AT_XULA, 500, [XULA], []), { kind: "fallback" });
  assert.deepEqual(pickDetectedClockInSite(FAR, 300, [XULA], ["xula"]), { kind: "fallback" }, "rough fix inside no assigned site");
});

test("pick: no usable fix = fallback (D15 b)", () => {
  assert.deepEqual(pickDetectedClockInSite(null, 5, [XULA], ["xula"]), { kind: "fallback" });
  assert.deepEqual(pickDetectedClockInSite(undefined, 5, [XULA], []), { kind: "fallback" });
  for (const acc of [null, undefined, 501, 5000, -1, NaN, Infinity]) {
    assert.deepEqual(pickDetectedClockInSite(AT_XULA, acc, [XULA], ["xula"]), { kind: "fallback" }, String(acc));
  }
});

test("pick: no located site at all = fallback (keep today's flow)", () => {
  assert.deepEqual(pickDetectedClockInSite(AT_XULA, 5, [{ id: "x", name: "X", active: true }], ["x"]), { kind: "fallback" });
  assert.deepEqual(pickDetectedClockInSite(AT_XULA, 5, [], []), { kind: "fallback" });
});

test("pick: overlapping sites = closest inside wins; assignedSiteIds junk ignored", () => {
  assert.equal(pickDetectedClockInSite({ lat: 29.951, lng: -90.07 }, 5, [BIG, SMALL], null).siteId, "small");
  assert.equal(pickDetectedClockInSite({ lat: 29.951, lng: -90.07 }, 300, [BIG, SMALL], ["big", 7]).siteId, "big", "rough fix: only the assigned site");
});

test("pickEmployeeClockInSite: detected wins, noMatch = none, fallback = the Phase 3 site", () => {
  assert.deepEqual(pickEmployeeClockInSite({ kind: "detected", siteId: "xula", siteName: "Xula" }, PHASE3), { siteId: "xula", siteName: "Xula", autoDetected: true });
  assert.deepEqual(pickEmployeeClockInSite({ kind: "noMatch" }, PHASE3), { siteId: null, siteName: "", autoDetected: false });
  assert.deepEqual(pickEmployeeClockInSite({ kind: "fallback" }, PHASE3), { ...PHASE3, autoDetected: false });
  assert.deepEqual(pickEmployeeClockInSite(null, PHASE3), { ...PHASE3, autoDetected: false });
});

test("geofence for a kept pick: its own fence, else the fenced-only check", () => {
  const kept = geofenceForKeptSite(FAR, 5, [XULA, HOME], "xula");
  assert.equal(kept.applicable, true);
  assert.equal(kept.status, "outside");
  assert.equal(geofenceForKeptSite(AT_XULA, 5, [XULA], "xula").status, "inside");
  assert.equal(geofenceForKeptSite(FAR, 5, [XULA, HOME], "home").applicable, false, "unfenced kept site: no badge");
  assert.equal(geofenceForKeptSite(FAR, 5, [XULA, HOME], "gone").applicable, false, "kept site not located: no badge");
  const none = geofenceForKeptSite(null, null, [XULA, HOME], null);
  assert.equal(none.status, "outside", "no pick, no fix, a fenced site exists = outside");
});

test("geofence for a detected pick: same as detectClockInSite", () => {
  const d = geofenceForDetectedSite(AT_XULA, 5, [XULA], { kind: "detected", siteId: "xula", siteName: "Xula" });
  assert.equal(d.status, "inside");
  assert.equal(geofenceForDetectedSite({ lat: 29.9946, lng: -90.2417 }, 5, [HOME, XULA], { kind: "detected", siteId: "home", siteName: "Home" }).applicable, false);
  assert.equal(geofenceForDetectedSite(FAR, 5, [HOME, XULA], { kind: "noMatch" }).status, "outside");
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
