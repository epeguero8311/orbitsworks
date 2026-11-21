// B (2026-11-21) - lib/punchFlags.ts and the time-not-proven part of
// lib/syncedLate.ts (Approve Hours tags for late / flagged punches).
// Plain Node, no emulator. Node 24+ loads the .ts files directly.
// Run via: node --test test/punchFlags.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { punchProblems, replacedPunches, replacedSourceText } from "../lib/punchFlags.ts";
import { syncedLatePunches } from "../lib/syncedLate.ts";

const ts = (m) => ({ toMillis: () => m });

test("problems: clock set back, photo missing, conflict - each listed, clean punches left out", () => {
  const out = punchProblems([
    { id: "a", type: "in", timestamp: ts(1), phoneClockOff: true, photoMissing: true },
    { id: "b", type: "out", timestamp: ts(2), punchConflict: true },
    { id: "c", type: "breakStart", timestamp: ts(3) },
  ]);
  assert.deepEqual(out, [
    { id: "a", type: "in", atMs: 1, items: ["The phone's clock was set back", "Photo missing, face not checked"] },
    { id: "b", type: "out", atMs: 2, items: ["Doesn't fit the other punches - check Time Tracking"] },
  ]);
});

test("replaced: each real punch with the events it replaced and their own times", () => {
  const out = replacedPunches([
    { id: "o", type: "out", timestamp: ts(10), replacedEvents: [{ id: "auto-x", type: "out", source: "autoClockOut", timestampMs: 20 }] },
    { id: "i", type: "in", timestamp: ts(5) },
  ]);
  assert.deepEqual(out, [{ id: "o", type: "out", atMs: 10, replaced: [{ type: "out", source: "autoClockOut", atMs: 20 }] }]);
  assert.equal(replacedSourceText("autoClockOut"), "auto");
  assert.equal(replacedSourceText("adminManual"), "hand-entered");
});

test("synced late: carries time not proven and offline since", () => {
  const out = syncedLatePunches([
    { id: "a", type: "in", syncedLate: true, timestamp: ts(0), createdAt: ts(49 * 3600000), timeNotProven: true, offlineSinceMs: -5 },
    { id: "b", type: "out", syncedLate: true, timestamp: ts(0), createdAt: ts(600000) },
  ]);
  assert.equal(out[0].timeNotProven, true);
  assert.equal(out[0].offlineSinceMs, -5);
  assert.equal(out[1].timeNotProven, false);
  assert.equal(out[1].offlineSinceMs, null);
});
