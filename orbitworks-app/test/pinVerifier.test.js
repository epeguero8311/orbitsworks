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
