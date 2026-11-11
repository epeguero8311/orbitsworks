// Employee App - PIN check on the phone (lib/pinVerifier.js): the hash
// matches the server's, the saved values are checked, and the wrong-PIN
// lock follows the server's rule. Run: node --test test/pinVerifier.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const p = require("../lib/pinVerifier");

const SALT = "AbCdEfGhIjKlMnOpQrStUv";
// Same as the server's pinVerifierHash (functions/src/lib/pinVerifier.ts).
const serverHash = (salt, pin) => createHash("sha256").update(`${salt}:${pin}`, "utf8").digest("hex");
const phoneHash = (salt, pin) => createHash("sha256").update(p.hashInput(salt, pin), "utf8").digest("hex");

test("the phone builds the same hash input as the server", () => {
  assert.equal(phoneHash(SALT, "1234"), serverHash(SALT, "1234"));
  assert.notEqual(phoneHash(SALT, "1235"), serverHash(SALT, "1234"));
});

test("parseVerifier: ok, noPin, inactive, and anything odd is null", () => {
  const hash = serverHash(SALT, "1234");
  assert.deepEqual(p.parseVerifier({ status: "ok", v: 1, salt: SALT, hash }), { status: "ok", salt: SALT, hash });
  assert.deepEqual(p.parseVerifier({ status: "noPin" }), { status: "noPin" });
  assert.deepEqual(p.parseVerifier({ status: "inactive" }), { status: "inactive" });
  assert.equal(p.parseVerifier({ status: "ok", v: 2, salt: SALT, hash }), null);
  assert.equal(p.parseVerifier({ status: "ok", v: 1, salt: "short", hash }), null);
  assert.equal(p.parseVerifier({ status: "ok", v: 1, salt: SALT, hash: "1234" }), null);
  assert.equal(p.parseVerifier({ status: "ok", v: 1, salt: SALT, hash: hash.toUpperCase() }), null);
  assert.equal(p.parseVerifier(null), null);
  assert.equal(p.parseVerifier("ok"), null);
});

test("readSavedVerifier: round trip, junk is null", () => {
  const hash = serverHash(SALT, "1234");
  assert.deepEqual(p.readSavedVerifier(JSON.stringify({ salt: SALT, hash })), { salt: SALT, hash });
  assert.equal(p.readSavedVerifier("{"), null);
  assert.equal(p.readSavedVerifier(null), null);
  assert.equal(p.readSavedVerifier(JSON.stringify({ salt: SALT })), null);
});

test("hashesMatch", () => {
  const a = serverHash(SALT, "1234");
  assert.equal(p.hashesMatch(a, a), true);
  assert.equal(p.hashesMatch(a, serverHash(SALT, "4321")), false);
  assert.equal(p.hashesMatch(a, a.slice(1)), false);
  assert.equal(p.hashesMatch(undefined, a), false);
});

test("lock: 2 tries left, 1 try left, then a 60 s lock (server wording)", () => {
  const NOW = 1_000_000;
  let r = p.afterWrongPin(null, NOW);
  assert.equal(r.error.message, "Wrong PIN. 2 tries left before a 1-minute lock.");
  assert.equal(r.error.details.reason, "wrongPin");
  r = p.afterWrongPin(r.lock, NOW + 1000);
  assert.equal(r.error.message, "Wrong PIN. 1 try left before a 1-minute lock.");
  r = p.afterWrongPin(r.lock, NOW + 2000);
  assert.equal(r.error.details.reason, "locked");
  assert.equal(r.error.details.secondsLeft, 60);
  assert.equal(r.error.message, "Too many wrong PINs. Try again in 60 seconds.");
  assert.equal(r.lock.lockedUntil, NOW + 2000 + p.PIN_LOCK_MS);
});

test("lock: while locked every PIN gets the countdown; after it, a fresh count", () => {
  const NOW = 5_000_000;
  const locked = { failed: 0, lockedUntil: NOW + 30_500 };
  const during = p.afterWrongPin(locked, NOW);
  assert.equal(during.error.details.secondsLeft, 31);
  assert.deepEqual(during.lock, locked);
  assert.equal(p.lockSecondsLeftAt(locked, NOW), 31);
  const after = p.afterWrongPin(locked, NOW + 31_000);
  assert.deepEqual(after.lock, { failed: 1, lockedUntil: 0 });
  assert.equal(after.error.details.attemptsLeft, 2);
  assert.equal(p.lockSecondsLeftAt(locked, NOW + 31_000), 0);
});

test("readSavedLock: survives a restart, junk is null", () => {
  assert.deepEqual(p.readSavedLock(JSON.stringify({ failed: 2, lockedUntil: 0 })), { failed: 2, lockedUntil: 0 });
  assert.deepEqual(p.readSavedLock(JSON.stringify({ failed: 0, lockedUntil: 99 })), { failed: 0, lockedUntil: 99 });
  assert.equal(p.readSavedLock(JSON.stringify({ failed: 0, lockedUntil: 0 })), null);
  assert.equal(p.readSavedLock("nope"), null);
  assert.equal(p.readSavedLock(undefined), null);
});

// ---- runPinCheck (2026-11-10, option A): fast, and a slow or failed
// server never makes a right PIN "wrong" ----

// A fake phone. saved: "right" | "stale" | null (no check value).
// server: "fresh" (answers, saves the right value) | "fails" | "hangs".
function fakePhone({ saved = "right", online = true, server = "fresh", lock = null } = {}) {
  const state = { saved, lock, refreshes: 0, onlineChecks: 0 };
  const deps = {
    readLock: async () => state.lock,
    writeLock: async (l) => {
      state.lock = l;
    },
    // The right PIN is 1234. A stale value only matches the old PIN 9999.
    match: async (pin) => (state.saved === null ? null : state.saved === "right" ? pin === "1234" : pin === "9999"),
    isOnline: async () => {
      state.onlineChecks++;
      return online;
    },
    refresh: () => {
      state.refreshes++;
      if (server === "hangs") return new Promise(() => {});
      if (server === "fails") return Promise.resolve(false);
      state.saved = "right";
      return Promise.resolve(true);
    },
  };
  return { state, check: (pin, extra = {}) => p.runPinCheck({ pin, ...deps, deadlineMs: 100, ...extra }) };
}

test("runPinCheck: right PIN with a saved value is instant (no network at all)", async () => {
  const phone = fakePhone({ server: "hangs" });
  const t0 = Date.now();
  assert.deepEqual(await phone.check("1234"), { state: "ok" });
  assert.ok(Date.now() - t0 < 50);
  assert.equal(phone.state.refreshes, 0);
  assert.equal(phone.state.onlineChecks, 0);
});

test("runPinCheck: right PIN, stale saved value, server answers -> ok, no strike", async () => {
  const phone = fakePhone({ saved: "stale" });
  assert.deepEqual(await phone.check("1234"), { state: "ok" });
  assert.equal(phone.state.lock, null);
  assert.equal(phone.state.refreshes, 1);
});

test("runPinCheck: right PIN, stale value, server fails -> unknown (checked at sync), never wrong", async () => {
  const phone = fakePhone({ saved: "stale", server: "fails" });
  assert.deepEqual(await phone.check("1234"), { state: "unknown" });
  assert.equal(phone.state.lock, null);
});

test("runPinCheck: server hangs -> stops waiting at the deadline, unknown, no strike", async () => {
  const phone = fakePhone({ saved: "stale", server: "hangs" });
  const t0 = Date.now();
  assert.deepEqual(await phone.check("1234"), { state: "unknown" });
  const took = Date.now() - t0;
  assert.ok(took >= 90 && took < 400, `took ${took} ms`);
  assert.equal(phone.state.lock, null);
});

test("runPinCheck: a hanging connection check also counts toward the same deadline", async () => {
  const phone = fakePhone({ saved: "stale", server: "hangs" });
  const t0 = Date.now();
  const r = await phone.check("1234", { isOnline: () => new Promise(() => {}) });
  assert.deepEqual(r, { state: "unknown" });
  assert.ok(Date.now() - t0 < 400);
});

test("runPinCheck: no saved value and no answer -> unknown", async () => {
  const phone = fakePhone({ saved: null, server: "hangs" });
  assert.deepEqual(await phone.check("1234"), { state: "unknown" });
});

test("runPinCheck: no saved value, server answers -> checked against the fresh value", async () => {
  const right = fakePhone({ saved: null });
  assert.deepEqual(await right.check("1234"), { state: "ok" });
  const wrong = fakePhone({ saved: null });
  const r = await wrong.check("5555");
  assert.equal(r.state, "failed");
  assert.equal(r.err.details.reason, "wrongPin");
  assert.equal(wrong.state.refreshes, 1);
});

test("runPinCheck: wrong PIN online (fresh value) is rejected and counts toward the lock", async () => {
  const phone = fakePhone();
  for (const left of [2, 1]) {
    const r = await phone.check("5555");
    assert.equal(r.state, "failed");
    assert.equal(r.err.details.reason, "wrongPin");
    assert.equal(r.err.details.attemptsLeft, left);
  }
  const third = await phone.check("5555");
  assert.equal(third.err.details.reason, "locked");
  // Locked: even the right PIN waits.
  assert.equal((await phone.check("1234")).err.details.reason, "locked");
});

test("runPinCheck: offline with a saved value that doesn't match -> wrong at once (as before)", async () => {
  const phone = fakePhone({ online: false, server: "hangs" });
  const t0 = Date.now();
  const r = await phone.check("5555");
  assert.equal(r.err.details.reason, "wrongPin");
  assert.ok(Date.now() - t0 < 50);
  assert.equal(phone.state.refreshes, 0);
});

test("runPinCheck: offline right PIN is instant; offline with no value -> unknown", async () => {
  assert.deepEqual(await fakePhone({ online: false }).check("1234"), { state: "ok" });
  assert.deepEqual(await fakePhone({ online: false, saved: null }).check("1234"), { state: "unknown" });
});

test("runPinCheck: a right PIN clears an old strike count", async () => {
  const phone = fakePhone({ lock: { failed: 2, lockedUntil: 0 } });
  assert.deepEqual(await phone.check("1234"), { state: "ok" });
  assert.equal(phone.state.lock, null);
});
