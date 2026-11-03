// Employee App Phase 5 - pure logic for earlier PINs (src/lib/pinHistory.ts):
// a queued punch made with the PIN that was right at its own time still
// syncs after an admin changed the PIN. No emulator. Runs the compiled lib/.
// Run: node --test test/pinHistory.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("../lib/lib/pinHistory");
const { pinVerifierHash } = require("../lib/lib/pinVerifier");

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-03T18:00:00Z");
const empty = { entries: [], lastChangeMs: null };

// PIN "1111" until C1, "2222" from C1 until C2, "3333" (current) from C2.
const C1 = NOW - 5 * HOUR;
const C2 = NOW - 2 * HOUR;
const START = NOW - 30 * DAY;
function twoChanges() {
  const a = h.addPinChange(empty, "1111", C1, START);
  return h.addPinChange(a, "2222", C2, START);
}
const check = (pin, eventMs, extra = {}) =>
  h.queuedPinCheck({ pin, currentMatches: pin === "3333", history: twoChanges(), eventMs, nowMs: NOW, phoneClockOff: false, ...extra });

test("keeps 24 h of history, the same as the oldest queued punch the server takes", () => {
  assert.equal(h.PIN_HISTORY_KEEP_MS, DAY);
  const { QUEUED_MAX_AGE_MS } = require("../lib/employeeClockQueued");
  assert.equal(h.PIN_HISTORY_KEEP_MS, QUEUED_MAX_AGE_MS);
});

test("first change: the old PIN is stored as a salted hash with its active time, never in plain text", () => {
  const out = h.addPinChange(empty, "1111", C1, START);
  assert.equal(out.lastChangeMs, C1);
  assert.equal(out.entries.length, 1);
  const [e] = out.entries;
  assert.equal(e.fromMs, START);
  assert.equal(e.untilMs, C1);
  assert.equal(e.hash, pinVerifierHash(e.salt, "1111"));
  assert.ok(e.salt.length >= 16);
  assert.ok(!JSON.stringify(out).includes("1111"));
  // A new salt every time.
  const again = h.addPinChange(empty, "1111", C1, START);
  assert.notEqual(again.entries[0].salt, e.salt);
});

test("second change: the PIN in between starts when the first change landed", () => {
  const out = twoChanges();
  assert.equal(out.lastChangeMs, C2);
  assert.deepEqual(
    out.entries.map((e) => [e.fromMs, e.untilMs]),
    [
      [START, C1],
      [C1, C2],
    ]
  );
});

test("an old PIN that isn't 4 digits adds no entry, but the change time still moves", () => {
  for (const bad of [undefined, null, "", "12", "abcd", 1234]) {
    const out = h.addPinChange(empty, bad, C1, START);
    assert.equal(out.entries.length, 0, String(bad));
    assert.equal(out.lastChangeMs, C1);
  }
});

test("start time is never after the change time", () => {
  const out = h.addPinChange({ entries: [], lastChangeMs: C1 + HOUR }, "1111", C1, START);
  assert.equal(out.entries[0].fromMs, C1);
});

test("trim: entries changed 24 h+ ago are dropped, at most 20 kept (newest)", () => {
  let hist = h.addPinChange(empty, "1111", NOW - DAY - MIN, START);
  hist = h.addPinChange(hist, "2222", NOW, START);
  assert.deepEqual(hist.entries.map((e) => e.untilMs), [NOW]);
  let many = empty;
  for (let i = 0; i < 25; i++) many = h.addPinChange(many, "1234", NOW - (25 - i) * MIN, START);
  assert.equal(many.entries.length, h.PIN_HISTORY_MAX_ENTRIES);
  assert.equal(many.entries[many.entries.length - 1].untilMs, NOW - MIN);
  assert.equal(many.entries[0].untilMs, NOW - 20 * MIN);
});

test("readPinHistory: junk in, empty out; bad entries dropped", () => {
  assert.deepEqual(h.readPinHistory(undefined), empty);
  assert.deepEqual(h.readPinHistory({ entries: "x", lastChangeMs: "y" }), empty);
  const good = { salt: "s", hash: "a".repeat(64), fromMs: 1, untilMs: 2 };
  const out = h.readPinHistory({ entries: [good, { salt: "s" }, null, { ...good, untilMs: "2" }], lastChangeMs: 5 });
  assert.deepEqual(out, { entries: [good], lastChangeMs: 5 });
});

test("pinActiveEntry: the entry whose time window holds the punch", () => {
  const { entries } = twoChanges();
  assert.equal(h.pinActiveEntry(entries, C1 - MIN, NOW).untilMs, C1);
  assert.equal(h.pinActiveEntry(entries, C1, NOW).untilMs, C2, "at the change moment the new PIN is active");
  assert.equal(h.pinActiveEntry(entries, C2 - 1, NOW).untilMs, C2);
  assert.equal(h.pinActiveEntry(entries, C2, NOW), null, "from the last change on: the current PIN");
  assert.equal(h.pinActiveEntry(entries, NOW - DAY - 1, NOW), null, "older than 24 h");
});

test("queued check: current PIN always passes (as today), even with the phone clock off", () => {
  assert.equal(check("3333", NOW - MIN), "current");
  assert.equal(check("3333", C1 - HOUR), "current");
  assert.equal(check("3333", NOW - MIN, { phoneClockOff: true }), "current");
});

test("queued check: the PIN that was right at the punch's time passes as old", () => {
  assert.equal(check("1111", C1 - MIN), "old");
  assert.equal(check("2222", C1 + MIN), "old");
  assert.equal(check("2222", C2 - MIN), "old");
});

test("queued check: an old PIN used outside its own time is wrong", () => {
  assert.equal(check("1111", C1 + MIN), "wrong", "first PIN after the first change");
  assert.equal(check("2222", C1 - MIN), "wrong", "second PIN before it was set");
  assert.equal(check("2222", C2 + MIN), "wrong", "second PIN after the second change");
  assert.equal(check("1111", NOW - MIN), "wrong");
  assert.equal(check("9999", C1 - MIN), "wrong", "never a PIN");
});

test("queued check: old PIN refused when the phone clock was set back (phoneClockOff)", () => {
  assert.equal(check("1111", C1 - MIN, { phoneClockOff: true }), "wrong");
});

test("queued check: no history, or a changed hash, is wrong", () => {
  assert.equal(h.queuedPinCheck({ pin: "1111", currentMatches: false, history: empty, eventMs: C1 - MIN, nowMs: NOW, phoneClockOff: false }), "wrong");
  const hist = twoChanges();
  hist.entries[0] = { ...hist.entries[0], hash: "0".repeat(64) };
  assert.equal(h.queuedPinCheck({ pin: "1111", currentMatches: false, history: hist, eventMs: C1 - MIN, nowMs: NOW, phoneClockOff: false }), "wrong");
});

test("queued check: a change 24 h+ ago no longer helps", () => {
  const hist = h.addPinChange(empty, "1111", NOW - DAY - MIN, START);
  assert.equal(h.queuedPinCheck({ pin: "1111", currentMatches: false, history: hist, eventMs: NOW - DAY - 2 * MIN, nowMs: NOW, phoneClockOff: false }), "wrong");
});
