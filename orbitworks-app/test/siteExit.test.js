// Phase 8 - lib/validators/siteExit.js: the fence rule and the payload.
const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../lib/validators/siteExit");

// 0.001 deg latitude is about 111 m.
const FENCE = { lat: 30, lng: -97, radiusM: 100 };
const at = (metersNorth, accuracyM) => ({ lat: 30 + metersNorth / 111195, lng: -97, accuracyM, fixAtMs: 1 });

test("fenceSide: inside, with the accuracy in the worker's favor", () => {
  assert.equal(v.fenceSide(at(0, 10), FENCE), "inside");
  assert.equal(v.fenceSide(at(100, 5), FENCE), "inside");
  assert.equal(v.fenceSide(at(150, 60), FENCE), "inside");
});

test("fenceSide: outside only past radius + max(accuracy, 25 m)", () => {
  // Accuracy under 25 m: the 25 m buffer leaves a gap that changes nothing.
  assert.equal(v.fenceSide(at(120, 5), FENCE), "unsure");
  assert.equal(v.fenceSide(at(124, 5), FENCE), "unsure");
  assert.equal(v.fenceSide(at(130, 5), FENCE), "outside");
  // Accuracy 25 m or more: outside starts right where inside ends.
  assert.equal(v.fenceSide(at(155, 60), FENCE), "inside");
  assert.equal(v.fenceSide(at(170, 60), FENCE), "outside");
  assert.equal(v.fenceSide(at(400, 90), FENCE), "outside");
});

test("fenceSide: worse than 100 m, no accuracy or no fix is unsure", () => {
  assert.equal(v.fenceSide(at(1000, 101), FENCE), "unsure");
  assert.equal(v.fenceSide(at(1000, null), FENCE), "unsure");
  assert.equal(v.fenceSide(null, FENCE), "unsure");
  assert.equal(v.fenceSide(at(1000, 5), null), "unsure");
  assert.equal(v.fenceSide(at(1000, 5), { lat: 30, lng: -97, radiusM: 0 }), "unsure");
});

test("toFence keeps only a real fence", () => {
  assert.deepEqual(v.toFence({ lat: 1, lng: 2, radiusM: 50, extra: 1 }), { lat: 1, lng: 2, radiusM: 50 });
  assert.equal(v.toFence({ lat: 1, lng: 2 }), null);
  assert.equal(v.toFence(null), null);
});

test("toSiteExitPayload: left start with a fix, end without one", () => {
  const row = { exitId: "e", clockInEventId: "c", kind: "left", phase: "start", atMs: 10.4, lat: 1, lng: 2, accuracyM: 8, fixAtMs: 9.6 };
  assert.deepEqual(v.toSiteExitPayload(row), {
    exitId: "e", clockInEventId: "c", kind: "left", phase: "start", atMs: 10,
    location: { lat: 1, lng: 2, accuracyM: 8, fixAtMs: 10 },
  });
  assert.deepEqual(v.toSiteExitPayload({ ...row, phase: "end", lat: null }), { exitId: "e", clockInEventId: "c", kind: "left", phase: "end", atMs: 10 });
});

test("toSiteExitPayload: trackingOff start always carries a known reason", () => {
  const row = { exitId: "e", clockInEventId: "c", kind: "trackingOff", phase: "start", atMs: 5, offReason: "signedOut" };
  assert.equal(v.toSiteExitPayload(row).offReason, "signedOut");
  assert.equal(v.toSiteExitPayload({ ...row, offReason: "weird" }).offReason, "appStopped");
  assert.equal(v.toSiteExitPayload({ ...row, phase: "end" }).offReason, undefined);
});
