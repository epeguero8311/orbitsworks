// Task 6 (update banner) - lib/appVersion.js
const test = require("node:test");
const assert = require("node:assert/strict");

let v;
test.before(async () => {
  v = await import("../lib/appVersion.js");
});

test("compareVersions: numeric per part, missing parts = 0", () => {
  assert.equal(v.compareVersions("1.1.6", "1.1.7"), -1);
  assert.equal(v.compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(v.compareVersions("1.1", "1.1.0"), 0);
  assert.equal(v.compareVersions("2", "1.99.99"), 1);
});

const NOW = new Date(2026, 10, 25, 14, 0).getTime();
const TOMORROW = new Date(2026, 10, 26, 8, 0).getTime();
const state = (doc, extra = {}) => v.updateState({ current: "1.1.6", platform: "ios", doc, dismissed: null, nowMs: NOW, ...extra });

test("no doc / no platform entry / no latest / up to date -> nothing", () => {
  assert.equal(state(null).kind, "none");
  assert.equal(state({ android: { latest: "1.2.0" } }).kind, "none");
  assert.equal(state({ ios: {} }).kind, "none");
  assert.equal(state({ ios: { latest: "1.1.6" } }).kind, "none");
  assert.equal(state({ ios: { latest: "1.1.5" } }).kind, "none");
  assert.equal(state({ ios: { latest: "junk" } }).kind, "none");
  assert.equal(state({ ios: { latest: "1.2" } }, { current: "dev" }).kind, "none");
});

test("behind latest -> banner with both versions", () => {
  assert.deepEqual(state({ ios: { latest: "1.1.7" } }), { kind: "banner", latest: "1.1.7", current: "1.1.6" });
  assert.equal(state({ android: { latest: "1.1.7" } }, { platform: "android" }).kind, "banner");
});

test("dismiss hides it for the rest of the day, back the next day or for a newer latest", () => {
  const doc = { ios: { latest: "1.1.7" } };
  const dismissed = v.dismissValue("1.1.7", NOW);
  assert.equal(state(doc, { dismissed }).kind, "none");
  assert.equal(state(doc, { dismissed, nowMs: TOMORROW }).kind, "banner");
  assert.equal(state({ ios: { latest: "1.1.8" } }, { dismissed }).kind, "banner");
});

test("min: unset never forces; below min -> force (not dismissable); at/above min -> banner rules", () => {
  assert.equal(state({ ios: { latest: "1.1.7", min: "1.1.7" } }).kind, "force");
  assert.equal(state({ ios: { latest: "1.1.7", min: "1.1.7" } }, { dismissed: v.dismissValue("1.1.7", NOW) }).kind, "force");
  assert.equal(state({ ios: { min: "1.1.7" } }).latest, "1.1.7");
  assert.equal(state({ ios: { latest: "1.1.7", min: "1.1.6" } }).kind, "banner");
  assert.equal(state({ ios: { latest: "1.1.7", min: null } }).kind, "banner");
});

test("store links", () => {
  assert.equal(v.storeUrl("ios", {}), "https://apps.apple.com/app/id6801155800");
  assert.equal(v.storeUrl("ios", { variant: "dev" }), "itms-beta://");
  assert.equal(v.storeUrl("android", { androidPackage: "com.orbitworks.app" }), "https://play.google.com/store/apps/details?id=com.orbitworks.app");
});
