// Phase 8 - siteExitValidators.ts (leave tracking calls). Pure zod, no
// emulator. Runs the compiled lib/ (npm run build first).
// Run: node --test test/siteExitValidators.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../lib/siteExitValidators");

const EXIT = "11111111-2222-4333-8444-555555555555";
const SHIFT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const FIX = { lat: 30.1, lng: -97.7, accuracyM: 12, fixAtMs: 1760000000000 };
const base = (o = {}) => ({ exitId: EXIT, clockInEventId: SHIFT, kind: "left", phase: "start", atMs: 1760000000000, location: FIX, ...o });
const parse = (input) => v.recordSiteExitSchema.safeParse(input);

test("record: left start / end pass, with or without a location", () => {
  assert.ok(parse(base()).success);
  assert.ok(parse(base({ phase: "end" })).success);
  assert.ok(parse(base({ location: null })).success);
  const { location, ...noLocation } = base();
  assert.ok(parse(noLocation).success);
});

test("record: a bad location becomes null, never a reject", () => {
  const r = parse(base({ location: { lat: 999, lng: 0, accuracyM: 1, fixAtMs: 1 } }));
  assert.ok(r.success);
  assert.equal(r.data.location, null);
});

test("record: trackingOff start needs a reason, nothing else takes one", () => {
  assert.ok(parse(base({ kind: "trackingOff", offReason: "permission", location: null })).success);
  assert.ok(parse(base({ kind: "trackingOff", offReason: "signedOut" })).success);
  assert.ok(parse(base({ kind: "trackingOff", offReason: "appStopped" })).success);
  assert.ok(!parse(base({ kind: "trackingOff" })).success);
  assert.ok(parse(base({ kind: "trackingOff", phase: "end" })).success);
  assert.ok(!parse(base({ kind: "trackingOff", phase: "end", offReason: "permission" })).success);
  assert.ok(!parse(base({ offReason: "permission" })).success);
  assert.ok(!parse(base({ kind: "trackingOff", offReason: "bored" })).success);
});

test("record: bad ids, kind, phase, time and extra fields fail", () => {
  assert.ok(!parse(base({ exitId: "not-a-uuid" })).success);
  assert.ok(!parse(base({ clockInEventId: "x" })).success);
  assert.ok(!parse(base({ kind: "visit" })).success);
  assert.ok(!parse(base({ phase: "middle" })).success);
  assert.ok(!parse(base({ atMs: 0 })).success);
  assert.ok(!parse(base({ atMs: 1.5 })).success);
  assert.ok(!parse(base({ employeeId: "someone" })).success);
  assert.ok(!parse(base({ onBreak: true })).success);
});

test("getShiftFence: only the clock-in id", () => {
  assert.ok(v.getShiftFenceSchema.safeParse({ clockInEventId: SHIFT }).success);
  assert.ok(!v.getShiftFenceSchema.safeParse({ clockInEventId: "x" }).success);
  assert.ok(!v.getShiftFenceSchema.safeParse({ clockInEventId: SHIFT, employeeId: "e" }).success);
});

test("acceptLocationConsent: both versions, nothing else", () => {
  const ok = { locationConsentVersion: "loc-v1", privacyVersion: "p-v1" };
  assert.ok(v.acceptLocationConsentSchema.safeParse(ok).success);
  assert.ok(!v.acceptLocationConsentSchema.safeParse({ locationConsentVersion: "loc-v1" }).success);
  assert.ok(!v.acceptLocationConsentSchema.safeParse({ ...ok, privacyVersion: "" }).success);
  assert.ok(!v.acceptLocationConsentSchema.safeParse({ ...ok, employeeId: "e" }).success);
});
