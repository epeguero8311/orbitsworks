// RC1 follow-up - removedItemValidators.ts (reportRemovedItem input). Pure
// zod, no emulator. Runs the compiled lib/ (npm run build first).
// Run: node --test test/removedItemValidators.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../lib/removedItemValidators");
const siteExit = require("../lib/siteExitValidators");

const ID = "11111111-2222-4333-8444-555555555555";
const SHIFT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const T = Date.UTC(2026, 10, 20, 14, 0);
const parse = (input) => v.reportRemovedItemSchema.safeParse(input);
const punch = (o = {}) => ({ requestId: ID, kind: "punch", action: "in", madeAtMs: T, removedAtMs: T + 60000, ...o });
const comment = (o = {}) => ({ requestId: ID, kind: "comment", madeAtMs: T, removedAtMs: T + 60000, clockEventId: SHIFT, note: "Left early", ...o });

test("punch report: every action passes, failMessage optional", () => {
  for (const action of ["in", "out", "breakStart", "breakEnd"]) assert.ok(parse(punch({ action })).success, action);
  assert.ok(parse(punch({ failMessage: "Wrong PIN" })).success);
});

test("punch report: needs an action, never a comment's fields", () => {
  const { action, ...noAction } = punch();
  assert.equal(parse(noAction).success, false);
  assert.equal(parse(punch({ action: "clockIn" })).success, false);
  assert.equal(parse(punch({ note: "x" })).success, false);
  assert.equal(parse(punch({ clockEventId: SHIFT })).success, false);
});

test("comment report: names its shift, never an action", () => {
  assert.ok(parse(comment()).success);
  assert.ok(parse(comment({ note: undefined })).success);
  const { clockEventId, ...noShift } = comment();
  assert.equal(parse(noShift).success, false);
  assert.equal(parse(comment({ action: "in" })).success, false);
});

test("bad ids, times, sizes and extra fields are refused", () => {
  assert.equal(parse(punch({ requestId: "not-a-uuid" })).success, false);
  assert.equal(parse(punch({ madeAtMs: 5 })).success, false);
  assert.equal(parse(punch({ removedAtMs: T + 0.5 })).success, false);
  assert.equal(parse(punch({ failMessage: "x".repeat(301) })).success, false);
  assert.equal(parse(comment({ note: "x".repeat(1001) })).success, false);
  assert.equal(parse(comment({ note: "" })).success, false);
  assert.equal(parse(punch({ employeeId: "someoneElse" })).success, false);
  assert.equal(parse(punch({ kind: "siteExit" })).success, false);
});

test("leave tracking: roleChanged is a tracking-off reason (RC1)", () => {
  const off = { exitId: ID, clockInEventId: SHIFT, kind: "trackingOff", phase: "start", atMs: T, offReason: "roleChanged" };
  assert.ok(siteExit.recordSiteExitSchema.safeParse(off).success);
});
