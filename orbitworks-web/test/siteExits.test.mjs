// Phase 8 - "Left the job site" on the website (lib/siteExits.ts): red vs
// gray (on break E1, short F1 b, tracking off D13), the shift line, grouping.
// Plain Node, no emulator. Node 24+ loads the .ts file directly.
// Run via: node --test test/siteExits.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { SHORT_EXIT_MS, isShortExit, siteExitTone, redSiteExits, siteExitLine, groupSiteExitsByClockIn } from "../lib/siteExits.ts";

const MIN = 60 * 1000;
const fmt = (ms) => `T${ms / MIN}`;
const left = (o = {}) => ({ kind: "left", startMs: 10 * MIN, endMs: 30 * MIN, endReason: "returned", onBreak: false, offReason: null, clockInEventId: "s1", ...o });

test("red: a real exit; gray: on break, short (< 3 min back), tracking off", () => {
  assert.equal(siteExitTone(left()), "red");
  assert.equal(siteExitTone(left({ endMs: null, endReason: null })), "red");
  assert.equal(siteExitTone(left({ onBreak: true })), "gray");
  assert.equal(siteExitTone(left({ endMs: 10 * MIN + SHORT_EXIT_MS - 1 })), "gray");
  assert.equal(siteExitTone(left({ endMs: 10 * MIN + SHORT_EXIT_MS })), "red");
  assert.equal(siteExitTone({ ...left(), kind: "trackingOff" }), "gray");
});

test("short only counts a return, not a clock-out right after leaving", () => {
  assert.equal(isShortExit(left({ endMs: 11 * MIN })), true);
  assert.equal(isShortExit(left({ endMs: 11 * MIN, endReason: "clockOut" })), false);
  assert.equal(isShortExit(left({ endMs: null, endReason: null })), false);
});

test("redSiteExits keeps only the red ones", () => {
  const list = [left(), left({ onBreak: true }), { ...left(), kind: "trackingOff" }];
  assert.equal(redSiteExits(list).length, 1);
});

test("lines: left, open, clock-out, auto clock-out, on break, short", () => {
  assert.equal(siteExitLine(left(), fmt), "Left the job site from T10 - T30");
  assert.equal(siteExitLine(left({ endMs: null, endReason: null }), fmt), "Left the job site from T10 - no return yet");
  assert.equal(siteExitLine(left({ endReason: "clockOut" }), fmt), "Left the job site from T10 - clock-out T30");
  assert.equal(siteExitLine(left({ endReason: "autoClockOut" }), fmt), "Left the job site from T10 - auto clock-out T30");
  assert.equal(siteExitLine(left({ onBreak: true }), fmt), "Left the job site from T10 - T30 (on break)");
  assert.equal(siteExitLine(left({ endMs: 12 * MIN }), fmt), "Left the job site from T10 - T12 (short)");
});

test("lines: tracking off with each reason", () => {
  const off = (offReason, o = {}) => siteExitLine({ ...left(), kind: "trackingOff", endReason: "trackingOn", offReason, ...o }, fmt);
  assert.equal(off("permission"), "Tracking off from T10 - T30 (location permission off)");
  assert.equal(off("signedOut", { endReason: "clockOut" }), "Tracking off from T10 - clock-out T30 (signed out of the app)");
  assert.equal(off("appStopped"), "Tracking off from T10 - T30 (phone stopped tracking)");
  assert.equal(off("noFix"), "Tracking off from T10 - T30 (no good location fix)");
  assert.equal(off("noFix", { endMs: null, endReason: null }), "Tracking off from T10 - still off (no good location fix)");
});

test("grouped by clock-in, oldest first", () => {
  const map = groupSiteExitsByClockIn([left({ startMs: 50 }), left({ startMs: 5 }), left({ clockInEventId: "s2" }), left({ clockInEventId: "" })]);
  assert.deepEqual(map.get("s1").map((e) => e.startMs), [5, 50]);
  assert.equal(map.get("s2").length, 1);
  assert.equal(map.size, 2);
});
