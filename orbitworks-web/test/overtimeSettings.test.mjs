// Overtime (Task 1) step 1 - the Settings save validator.
// Run via: node --test test/overtimeSettings.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { overtimeSettingsSchema } from "../lib/validators/overtimeSettings.ts";

const valid = {
  overtimeEnabled: false,
  weeklyOvertimeThreshold: 40,
  dailyOvertimeThreshold: 0,
  overtimeWeekStartsOn: 1,
  overtimeMultiplier: 1.5,
  overtimeRoundMinutes: 0,
};

test("defaults pass (Overtime OFF, weekly 40, daily off, Monday, 1.5x, no rounding)", () => {
  assert.equal(overtimeSettingsSchema.safeParse(valid).success, true);
});

test("bad values are refused with a readable message", () => {
  const cases = [
    { weeklyOvertimeThreshold: -1 },
    { weeklyOvertimeThreshold: 169 },
    { weeklyOvertimeThreshold: NaN },
    { dailyOvertimeThreshold: 25 },
    { overtimeWeekStartsOn: 7 },
    { overtimeMultiplier: 0.9 },
    { overtimeMultiplier: NaN },
    { overtimeRoundMinutes: 10 },
  ];
  for (const c of cases) {
    const r = overtimeSettingsSchema.safeParse({ ...valid, ...c });
    assert.equal(r.success, false, JSON.stringify(c));
    assert.ok(r.error.issues[0].message.length > 0);
  }
});
