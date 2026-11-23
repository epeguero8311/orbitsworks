// "Adjust time" confirm step (lib/clockCorrection.ts) + parity with the
// server check (functions/src/clockCorrectionValidators.ts, compiled lib/ -
// run `npm run build` in functions first). No Firebase. Run from
// orbitworks-web:  node --test test/clockCorrection.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as web from "../lib/clockCorrection.ts";

const require = createRequire(import.meta.url);
const server = require("../functions/lib/clockCorrectionValidators.js");

const HOUR = 60 * 60 * 1000;
const ts = (ms) => ({ toMillis: () => ms });
const NOW = Date.UTC(2026, 10, 14, 18, 0);
const BASE = NOW - 30 * HOUR;
const ev = (id, type, ms, employeeId = "emp1", adjustedMs) => ({
  id, type, employeeId, timestamp: ts(ms), ...(adjustedMs ? { adjustedTimestamp: ts(adjustedMs) } : {}),
});
const shift = [
  ev("in1", "in", BASE),
  ev("bs1", "breakStart", BASE + 3 * HOUR),
  ev("be1", "breakEnd", BASE + 3.5 * HOUR),
  ev("out1", "out", BASE + 8 * HOUR),
  ev("in2", "in", BASE + 1 * HOUR, "emp2"),
];

test("review: a valid move shows old -> new and the events either side", () => {
  const r = web.reviewCorrection(shift[3], shift, BASE + 7 * HOUR, "", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.oldMs, BASE + 8 * HOUR);
  assert.equal(r.newMs, BASE + 7 * HOUR);
  assert.equal(r.neighbours.prev.id, "be1");
  assert.equal(r.neighbours.next, null);
});

test("review: out of order, future, same time, long reason are caught before the call", () => {
  assert.match(web.reviewCorrection(shift[0], shift, BASE + 9 * HOUR, "", NOW).error, /clock-in has to stay before the break start/);
  assert.match(web.reviewCorrection(shift[3], shift, NOW + 5 * 60 * 1000, "", NOW).error, /in the future/);
  assert.equal(web.reviewCorrection(shift[3], shift, NOW + 60 * 1000, "", NOW).ok, true);
  assert.match(web.reviewCorrection(shift[3], shift, BASE + 8 * HOUR, "", NOW).error, /same time/);
  assert.match(web.reviewCorrection(shift[3], shift, BASE + 7 * HOUR, "x".repeat(501), NOW).error, /under 500/);
  assert.match(web.reviewCorrection(shift[3], shift, NaN, "", NOW).error, /valid date/);
});

test("review: other employees never count; an earlier correction does", () => {
  assert.equal(web.reviewCorrection(shift[0], shift, BASE + 2 * HOUR, "", NOW).ok, true);
  const moved = [...shift.slice(0, 1), ev("bs1", "breakStart", BASE + 3 * HOUR, "emp1", BASE + 1.5 * HOUR), ...shift.slice(2)];
  assert.match(web.reviewCorrection(moved[0], moved, BASE + 2 * HOUR, "", NOW).error, /break start/);
});

test("parity: website and server agree on every case", () => {
  const ordered = web.toOrderedEvents(shift, "emp1");
  const cases = [];
  for (const target of ordered) {
    for (let h = -30; h <= 12; h += 0.5) cases.push([target.id, target.ms, BASE + h * HOUR]);
  }
  for (const [id, cur, next] of cases) {
    const a = web.findCorrectionConflict(ordered, id, cur, next);
    const b = server.findCorrectionConflict(ordered, id, cur, next);
    assert.deepEqual(a, b, `${id} -> ${next}`);
    if (a) assert.equal(web.correctionConflictMessage("in", a), server.correctionConflictMessage("in", b));
  }
  assert.equal(web.CORRECTION_FUTURE_SLACK_MS, server.CORRECTION_FUTURE_SLACK_MS);
  assert.equal(web.CORRECTION_REASON_MAX, server.CORRECTION_REASON_MAX);
});
