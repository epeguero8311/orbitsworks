// Overtime (Task 1) step 3 - Titles & Pay Overtime rate helpers + validator.
// Run via: node --test test/jobOvertimeRate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  isBelowOvertimeFloor,
  overtimeRateFloor,
  parseOvertimeRateInput,
  appendOvertimeRateHistory,
  overtimeRateAsOf,
} from "../lib/jobOvertimeRate.ts";
import { jobSchema } from "../lib/validators/job.ts";

test("plan examples: blank OT, $40 OT, $30 OT on a $23 title", () => {
  assert.equal(isBelowOvertimeFloor(15, null), false); // Laborer, blank -> multiplier
  assert.equal(isBelowOvertimeFloor(23, 40), false); // Foreman $40
  assert.equal(isBelowOvertimeFloor(23, 30), true); // Foreman $30 -> warn
  assert.equal(overtimeRateFloor(23), 34.5);
});

test("floor is a literal 1.5x, exact cents not flagged", () => {
  assert.equal(isBelowOvertimeFloor(23, 34.5), false);
  assert.equal(isBelowOvertimeFloor(23, 34.49), true);
  // 19.99 x 1.5 = 29.985 -> shown as $29.99; warning agrees with what's shown.
  assert.equal(overtimeRateFloor(19.99), 29.99);
  assert.equal(isBelowOvertimeFloor(19.99, 29.99), false);
  assert.equal(isBelowOvertimeFloor(19.99, 29.98), true);
});

test("input parsing: blank = null, bad = undefined", () => {
  assert.equal(parseOvertimeRateInput(""), null);
  assert.equal(parseOvertimeRateInput("  "), null);
  assert.equal(parseOvertimeRateInput("40"), 40);
  assert.equal(parseOvertimeRateInput("34.505"), 34.51);
  assert.equal(parseOvertimeRateInput("-1"), undefined);
  assert.equal(parseOvertimeRateInput("abc"), undefined);
});

test("history: seeded on first change, resolved as of a date", () => {
  const h1 = appendOvertimeRateHistory(undefined, null, 40, "2026-11-10");
  assert.deepEqual(h1, [
    { overtimeRate: null, effectiveFrom: "1970-01-01" },
    { overtimeRate: 40, effectiveFrom: "2026-11-10" },
  ]);
  const h2 = appendOvertimeRateHistory(h1, 40, 45, "2026-11-20");
  assert.equal(overtimeRateAsOf("2026-11-01", h2, 45), null);
  assert.equal(overtimeRateAsOf("2026-11-10", h2, 45), 40);
  assert.equal(overtimeRateAsOf("2026-11-19", h2, 45), 40);
  assert.equal(overtimeRateAsOf("2026-11-20", h2, 45), 45);
  assert.equal(overtimeRateAsOf("2026-11-20", undefined, undefined), null);
  assert.equal(overtimeRateAsOf("2026-11-20", [], 30), 30);
});

test("validator: OT rate optional, below-floor still valid (warn only)", () => {
  assert.equal(jobSchema.safeParse({ name: "Foreman", hourlyRate: 23, overtimeRate: null }).success, true);
  assert.equal(jobSchema.safeParse({ name: "Foreman", hourlyRate: 23, overtimeRate: 30 }).success, true);
  assert.equal(jobSchema.safeParse({ name: "Foreman", hourlyRate: 23, overtimeRate: -1 }).success, false);
  assert.equal(jobSchema.safeParse({ name: " ", hourlyRate: 23, overtimeRate: null }).success, false);
});
