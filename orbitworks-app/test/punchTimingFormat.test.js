// Dev-only punch timing readout math (lib/punchTimingFormat.js).
// Run: node --test test/punchTimingFormat.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const t = require("../lib/punchTimingFormat");

test("clock in: every step from its marks", () => {
  const steps = t.stepDurations({ start: 0, pinTyped: 2000, pinChecked: 2400, photoTaken: 5400, uploaded: 7600, punched: 8400, end: 8450 });
  assert.deepEqual(steps, { typingMs: 2000, pinCheckMs: 400, cameraMs: 3000, uploadMs: 2200, punchMs: 800, totalMs: 8400 });
});

test("break: only punch and total, no PIN or photo steps", () => {
  const steps = t.stepDurations({ start: 0, sendStart: 0, punched: 900, end: 950 });
  assert.equal(steps.typingMs, null);
  assert.equal(steps.pinCheckMs, null);
  assert.equal(steps.uploadMs, null);
  assert.equal(steps.punchMs, 900);
  assert.equal(steps.totalMs, 900);
});

test("failed attempt: total runs to the end mark", () => {
  const steps = t.stepDurations({ start: 0, pinTyped: 1500, end: 1900 });
  assert.equal(steps.pinCheckMs, null);
  assert.equal(steps.totalMs, 1900);
});

test("lines are ASCII and skip missing steps", () => {
  const lines = t.timingLines({ steps: { pinCheckMs: 400, uploadMs: null, totalMs: 8400 }, photoBytes: 655360 });
  assert.deepEqual(lines, ["PIN check 0.4s", "total 8.4s", "photo 640 KB"]);
  assert.ok(lines.every((l) => /^[\x20-\x7e]+$/.test(l)));
});

test("keeps the newest 10", () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = t.addTiming(list, { at: i });
  assert.equal(list.length, t.MAX_TIMINGS);
  assert.equal(list[0].at, 11);
  assert.equal(list[9].at, 2);
});
