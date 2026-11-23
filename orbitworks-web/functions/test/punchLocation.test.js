// Employee App Phase 6 - the punch location field (employeeClockValidators.ts)
// and the fix-time window (lib/punchLocation.ts). Pure logic, no emulator.
const test = require("node:test");
const assert = require("node:assert/strict");
const { employeeClockPunchSchema, punchLocationSchema } = require("../lib/employeeClockValidators.js");
const { locationForPunch, FIX_MAX_BEFORE_PUNCH_MS, FIX_MAX_AFTER_PUNCH_MS } = require("../lib/lib/punchLocation.js");

const PUNCH_MS = 1762300000000;
const FIX = { lat: 29.95, lng: -90.07, accuracyM: 12, fixAtMs: PUNCH_MS - 3000 };
const BREAK = { action: "breakStart", requestId: "1b4e28ba-2fa1-41d2-883f-0016d3cca427", queuedAtMs: PUNCH_MS };

function parse(extra) {
  const r = employeeClockPunchSchema.safeParse({ ...BREAK, ...extra });
  assert.equal(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
  return r.data;
}

test("location: a good fix passes as is", () => {
  assert.deepEqual(parse({ location: FIX }).location, FIX);
  assert.deepEqual(parse({ location: { ...FIX, accuracyM: null } }).location.accuracyM, null);
});

test("location: missing stays missing (older app), null stays null (no fix)", () => {
  assert.equal("location" in parse({}), false);
  assert.equal(parse({ location: null }).location, null);
});

test("location: bad values become null and never reject the punch", () => {
  const bad = [
    { ...FIX, lat: 91 },
    { ...FIX, lat: -90.5 },
    { ...FIX, lng: 181 },
    { ...FIX, lng: -181 },
    { ...FIX, lat: Number.NaN },
    { ...FIX, lng: Infinity },
    { ...FIX, lat: "29.9" },
    { ...FIX, accuracyM: -1 },
    { ...FIX, accuracyM: 100001 },
    { ...FIX, fixAtMs: 0 },
    { ...FIX, fixAtMs: 1.5 },
    { ...FIX, fixAtMs: "now" },
    { ...FIX, extra: 1 },
    { lat: 1, lng: 2 },
    "29.9,-90.0",
    42,
    [],
  ];
  for (const location of bad) {
    assert.equal(parse({ location }).location, null, JSON.stringify(location));
  }
});

test("location: edge values pass", () => {
  for (const f of [
    { ...FIX, lat: 90, lng: 180 },
    { ...FIX, lat: -90, lng: -180 },
    { ...FIX, accuracyM: 0 },
    { ...FIX, accuracyM: 100000 },
  ]) {
    assert.equal(punchLocationSchema.safeParse(f).success, true, JSON.stringify(f));
  }
});

test("location: the rest of the punch is still checked", () => {
  const r = employeeClockPunchSchema.safeParse({ ...BREAK, requestId: "nope", location: FIX });
  assert.equal(r.success, false);
});

test("window: 5 min before to 1 min after the punch, phone clock", () => {
  const at = (offset) => locationForPunch({ ...FIX, fixAtMs: PUNCH_MS + offset }, PUNCH_MS);
  assert.ok(at(0));
  assert.ok(at(-FIX_MAX_BEFORE_PUNCH_MS));
  assert.ok(at(FIX_MAX_AFTER_PUNCH_MS));
  assert.equal(at(-FIX_MAX_BEFORE_PUNCH_MS - 1), null);
  assert.equal(at(FIX_MAX_AFTER_PUNCH_MS + 1), null);
  assert.equal(at(-60 * 60 * 1000), null);
});

test("window: an offline punch made hours ago with a fix near its own time is kept", () => {
  const madeMs = PUNCH_MS - 6 * 60 * 60 * 1000;
  const fix = { ...FIX, fixAtMs: madeMs - 20000 };
  assert.deepEqual(locationForPunch(fix, madeMs), fix);
});

test("window: undefined and null pass through", () => {
  assert.equal(locationForPunch(undefined, PUNCH_MS), undefined);
  assert.equal(locationForPunch(null, PUNCH_MS), null);
});
