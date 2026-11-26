// Task 6 (update banner) - lib/appVersions.ts. Run: node --test test/appVersions.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
const { compareVersions, deviceVersionLabel, readAppVersionsConfig } = await import("../lib/appVersions.ts");

test("compareVersions", () => {
  assert.equal(compareVersions("1.1.6", "1.1.7"), -1);
  assert.equal(compareVersions("1.10", "1.9.9"), 1);
  assert.equal(compareVersions("1.1", "1.1.0"), 0);
});

test("readAppVersionsConfig: missing doc = null; junk entries = null versions", () => {
  assert.equal(readAppVersionsConfig(undefined), null);
  assert.deepEqual(readAppVersionsConfig({ ios: { latest: "1.1.7", min: "x" } }), {
    ios: { latest: "1.1.7", min: null },
    android: { latest: null, min: null },
  });
});

test("deviceVersionLabel: version + Outdated against the platform's latest", () => {
  const cfg = readAppVersionsConfig({ ios: { latest: "1.1.7" }, android: { latest: "1.1.6" } });
  assert.deepEqual(deviceVersionLabel("1.1.6", "ios", cfg), { text: "1.1.6", outdated: true });
  assert.deepEqual(deviceVersionLabel("1.1.7", "ios", cfg), { text: "1.1.7", outdated: false });
  assert.deepEqual(deviceVersionLabel("1.1.6", "android", cfg), { text: "1.1.6", outdated: false });
  assert.deepEqual(deviceVersionLabel("1.1.6", undefined, cfg), { text: "1.1.6", outdated: true }); // no platform -> ios
});

test("deviceVersionLabel: builds that don't report = 'Older than 1.1.6', outdated once a latest exists", () => {
  const cfg = readAppVersionsConfig({ ios: { latest: "1.1.6" } });
  assert.deepEqual(deviceVersionLabel(null, "ios", cfg), { text: "Older than 1.1.6", outdated: true });
  assert.deepEqual(deviceVersionLabel(undefined, "ios", null), { text: "Older than 1.1.6", outdated: false }); // no doc yet
  assert.deepEqual(deviceVersionLabel("1.1.6", "ios", null), { text: "1.1.6", outdated: false });
});
