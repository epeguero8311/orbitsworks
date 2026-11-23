// Phase 9 - employeeDuplicateValidators.ts. Pure zod, no emulator.
// Run: node --test test/employeeDuplicateValidators.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../lib/employeeDuplicateValidators");

test("dismissDuplicateFlag: an employee id, nothing else", () => {
  assert.ok(v.dismissDuplicateFlagSchema.safeParse({ employeeId: "emp_1-A" }).success);
  assert.ok(!v.dismissDuplicateFlagSchema.safeParse({ employeeId: "bad id" }).success);
  assert.ok(!v.dismissDuplicateFlagSchema.safeParse({}).success);
  assert.ok(!v.dismissDuplicateFlagSchema.safeParse({ employeeId: "e1", companyId: "c" }).success);
});
