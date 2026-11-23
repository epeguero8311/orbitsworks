const test = require("node:test");
const assert = require("node:assert/strict");
const {
  toPunchFix,
  pickPunchFix,
  fixFitsPunch,
  FIX_MAX_BEFORE_PUNCH_MS,
  FIX_MAX_AFTER_PUNCH_MS,
  LAST_KNOWN_MAX_AGE_MS,
} = require("../lib/validators/punchLocation");

const NOW = 1762300000000;
const pos = (over = {}, timestamp = NOW) => ({
  coords: { latitude: 29.95, longitude: -90.07, accuracy: 15, ...over },
  timestamp,
});
const fixAt = (ms) => ({ lat: 29.95, lng: -90.07, accuracyM: 15, fixAtMs: ms });

test("toPunchFix: expo position -> fix", () => {
  assert.deepEqual(toPunchFix(pos()), fixAt(NOW));
  assert.equal(toPunchFix(pos({ accuracy: null })).accuracyM, null);
  assert.equal(toPunchFix(pos({ accuracy: -1 })).accuracyM, null);
});

test("toPunchFix: bad positions -> null", () => {
  assert.equal(toPunchFix(null), null);
  assert.equal(toPunchFix({}), null);
  assert.equal(toPunchFix(pos({ latitude: 91 })), null);
  assert.equal(toPunchFix(pos({ longitude: -181 })), null);
  assert.equal(toPunchFix(pos({ latitude: Number.NaN })), null);
  assert.equal(toPunchFix(pos({ accuracy: 100001 })), null);
  assert.equal(toPunchFix(pos({}, 0)), null);
  assert.equal(toPunchFix({ coords: pos().coords }), null);
});

test("fixFitsPunch: same window as the server", () => {
  assert.equal(fixFitsPunch(fixAt(NOW - FIX_MAX_BEFORE_PUNCH_MS), NOW), true);
  assert.equal(fixFitsPunch(fixAt(NOW - FIX_MAX_BEFORE_PUNCH_MS - 1), NOW), false);
  assert.equal(fixFitsPunch(fixAt(NOW + FIX_MAX_AFTER_PUNCH_MS), NOW), true);
  assert.equal(fixFitsPunch(fixAt(NOW + FIX_MAX_AFTER_PUNCH_MS + 1), NOW), false);
  assert.equal(fixFitsPunch(null, NOW), false);
});

test("pickPunchFix: fresh fix wins when ready", () => {
  const fresh = fixAt(NOW - 30000);
  assert.equal(pickPunchFix({ fresh, lastKnown: fixAt(NOW - 1000), punchMs: NOW }), fresh);
});

test("pickPunchFix: no fresh fix -> last known up to 2 min old", () => {
  const lk = fixAt(NOW - LAST_KNOWN_MAX_AGE_MS);
  assert.equal(pickPunchFix({ fresh: null, lastKnown: lk, punchMs: NOW }), lk);
  assert.equal(pickPunchFix({ fresh: null, lastKnown: fixAt(NOW - LAST_KNOWN_MAX_AGE_MS - 1), punchMs: NOW }), null);
});

test("pickPunchFix: a fresh fix older than the window falls back, then none", () => {
  const stale = fixAt(NOW - FIX_MAX_BEFORE_PUNCH_MS - 1);
  const lk = fixAt(NOW - 5000);
  assert.equal(pickPunchFix({ fresh: stale, lastKnown: lk, punchMs: NOW }), lk);
  assert.equal(pickPunchFix({ fresh: stale, lastKnown: null, punchMs: NOW }), null);
});

test("pickPunchFix: nothing -> null", () => {
  assert.equal(pickPunchFix({ fresh: null, lastKnown: null, punchMs: NOW }), null);
  assert.equal(pickPunchFix({}), null);
});
