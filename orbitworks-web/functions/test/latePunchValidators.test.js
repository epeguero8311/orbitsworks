// B (2026-11-21) - employeeClockPunch input: lastServerMs and photoMissing
// (employeeClockValidators.ts). Pure logic, no emulator.
// Run: npm run build && node --test test/latePunchValidators.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { employeeClockPunchSchema } = require("../lib/employeeClockValidators.js");

const AT = 1762300000000;
const ID = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const PHOTO = "companies/c1/clockEvents/e1/1b4e28ba-2fa1-41d2-883f-0016d3cca427.jpg";
const IN = { action: "in", requestId: ID, pin: "4821", photoPath: PHOTO, queuedAtMs: AT };

const ok = (v) => employeeClockPunchSchema.safeParse(v).success;

test("lastServerMs: only with a queued time; any positive whole ms", () => {
  assert.equal(ok({ ...IN, lastServerMs: AT - 3600000 }), true);
  assert.equal(ok({ action: "in", requestId: ID, pin: "4821", photoPath: PHOTO, lastServerMs: AT }), false, "online punch");
  assert.equal(ok({ ...IN, lastServerMs: 1.5 }), false);
  assert.equal(ok({ ...IN, lastServerMs: -1 }), false);
});

test("photoMissing: a queued clock in/out with no photo path passes", () => {
  const { photoPath: _p, ...noPhoto } = IN;
  assert.equal(ok({ ...noPhoto, photoMissing: true }), true);
  assert.equal(ok({ ...noPhoto, action: "out", photoMissing: true }), true);
});

test("photoMissing: never with a photo, never online, never on a break, only true", () => {
  const { photoPath: _p, ...noPhoto } = IN;
  assert.equal(ok({ ...IN, photoMissing: true }), false, "photo and photoMissing");
  const { queuedAtMs: _q, ...online } = noPhoto;
  assert.equal(ok({ ...online, photoMissing: true }), false, "online");
  assert.equal(
    ok({ action: "breakStart", requestId: ID, queuedAtMs: AT, photoMissing: true }),
    false,
    "break"
  );
  assert.equal(ok({ ...noPhoto, photoMissing: false }), false);
});

test("without photoMissing a clock in/out still needs its photo (unchanged)", () => {
  const { photoPath: _p, ...noPhoto } = IN;
  assert.equal(ok(noPhoto), false);
  assert.equal(ok(IN), true);
});
