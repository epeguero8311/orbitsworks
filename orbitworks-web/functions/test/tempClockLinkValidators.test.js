// Phase 10 fix round 1 - tempClockLinkValidators.ts (W1 list calls) and
// getMyPinSchema (A1 Show PIN). Pure zod, no emulator. Runs the compiled
// lib/ (npm run build first).
// Run: node --test test/tempClockLinkValidators.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../lib/tempClockLinkValidators");
const { getMyPinSchema } = require("../lib/employeeClockValidators");

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012_-9";

test("history: no input or a 32-char base64url afterToken", () => {
  assert.equal(TOKEN.length, 32);
  assert.ok(v.listTempClockLinkHistorySchema.safeParse({}).success);
  assert.ok(v.listTempClockLinkHistorySchema.safeParse({ afterToken: TOKEN }).success);
});

test("history: bad afterToken or extra fields refused", () => {
  for (const afterToken of ["", "short", TOKEN + "x", TOKEN.slice(0, 31) + "/", 12, null]) {
    assert.equal(v.listTempClockLinkHistorySchema.safeParse({ afterToken }).success, false, String(afterToken));
  }
  assert.equal(v.listTempClockLinkHistorySchema.safeParse({ companyId: "other" }).success, false);
  assert.equal(v.listTempClockLinkHistorySchema.safeParse({ limit: 500 }).success, false, "the page size is fixed");
});

test("active list and getMyPin take nothing", () => {
  assert.ok(v.listActiveTempClockLinksSchema.safeParse({}).success);
  assert.equal(v.listActiveTempClockLinksSchema.safeParse({ companyId: "x" }).success, false);
  assert.ok(getMyPinSchema.safeParse({}).success);
  assert.equal(getMyPinSchema.safeParse({ employeeId: "emp2" }).success, false);
});
