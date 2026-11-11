// Employee App - PIN check on the phone (decided 2026-11-02: A1, L1, E1).
// No React Native, Expo or Firebase imports, so test/pinVerifier.test.js
// can run it under `node --test`. The SecureStore / server side is
// lib/pinCheck.js.
//
// The server (getMyPinVerifier, orbitworks-web/functions/src/lib/
// pinVerifier.ts) hands out a salted SHA-256 of this employee's own PIN:
// hash = sha256_hex(salt + ":" + pin). The phone hashes the typed PIN the
// same way, so a wrong PIN shows at once, online or offline. The server
// still checks the real PIN on every punch it receives.
//
// The wrong-PIN lock is the server's rule, kept on the phone: 3 wrong in a
// row = 1-minute lock, the same messages. A finished lock starts a fresh
// count. The lock is saved (SecureStore), so restarting the app doesn't
// reset it.

const PIN_MAX_WRONG = 3;
const PIN_LOCK_MS = 60 * 1000;
const VERIFIER_VERSION = 1;
// Longest the PIN screen waits on the network (connection check + a fresh
// check value from the server) before it stops waiting.
const PIN_CHECK_DEADLINE_MS = 3000;

function hashInput(salt, pin) {
  return `${salt}:${pin}`;
}

// The server's answer -> { status: "ok", salt, hash } | { status: "noPin" }
// | { status: "inactive" }, or null when it doesn't look right.
function parseVerifier(data) {
  if (!data || typeof data !== "object") return null;
  if (data.status === "noPin" || data.status === "inactive") return { status: data.status };
  if (data.status !== "ok" || data.v !== VERIFIER_VERSION) return null;
  if (typeof data.salt !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(data.salt)) return null;
  if (typeof data.hash !== "string" || !/^[0-9a-f]{64}$/.test(data.hash)) return null;
  return { status: "ok", salt: data.salt, hash: data.hash };
}

// A saved verifier (JSON from SecureStore) -> { salt, hash } or null.
function readSavedVerifier(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = parseVerifier({ status: "ok", v: VERIFIER_VERSION, ...JSON.parse(raw) });
    return parsed && parsed.status === "ok" ? { salt: parsed.salt, hash: parsed.hash } : null;
  } catch {
    return null;
  }
}

// Same-length hex compare that doesn't stop at the first difference.
function hashesMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- lock ----
// lock: { failed, lockedUntil } (ms) or null.

function readSavedLock(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const l = JSON.parse(raw);
    const failed = Number.isInteger(l.failed) && l.failed > 0 ? l.failed : 0;
    const lockedUntil = typeof l.lockedUntil === "number" && l.lockedUntil > 0 ? l.lockedUntil : 0;
    return failed || lockedUntil ? { failed, lockedUntil } : null;
  } catch {
    return null;
  }
}

function lockSecondsLeftAt(lock, nowMs) {
  if (!lock || !(lock.lockedUntil > nowMs)) return 0;
  return Math.ceil((lock.lockedUntil - nowMs) / 1000);
}

function lockedMessage(secondsLeft) {
  return `Too many wrong PINs. Try again in ${secondsLeft} second${secondsLeft === 1 ? "" : "s"}.`;
}

function wrongPinMessage(attemptsLeft) {
  return `Wrong PIN. ${attemptsLeft} ${attemptsLeft === 1 ? "try" : "tries"} left before a 1-minute lock.`;
}

// Shaped like the server's errors, so the clock screen shows it the same way.
function lockedError(secondsLeft) {
  return { local: true, message: lockedMessage(secondsLeft), details: { reason: "locked", secondsLeft } };
}

function wrongPinError(attemptsLeft) {
  return { local: true, message: wrongPinMessage(attemptsLeft), details: { reason: "wrongPin", attemptsLeft } };
}

// A wrong PIN: the new lock to save and the error to show.
function afterWrongPin(lock, nowMs) {
  const seconds = lockSecondsLeftAt(lock, nowMs);
  if (seconds > 0) return { lock, error: lockedError(seconds) };
  const finishedLock = !!(lock && lock.lockedUntil > 0);
  const failed = (finishedLock ? 0 : (lock && lock.failed) || 0) + 1;
  if (failed >= PIN_MAX_WRONG) {
    const seconds2 = Math.ceil(PIN_LOCK_MS / 1000);
    return { lock: { failed: 0, lockedUntil: nowMs + PIN_LOCK_MS }, error: lockedError(seconds2) };
  }
  return { lock: { failed, lockedUntil: 0 }, error: wrongPinError(PIN_MAX_WRONG - failed) };
}

// ---- the whole check ----

// The promise's value, or fallback if it fails or isn't done within ms.
// The promise keeps running (a late check value is still saved for next
// time); only the wait is cut short.
function withinDeadline(promise, ms, fallback) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      done = true;
      resolve(fallback);
    }, Math.max(0, ms));
    Promise.resolve(promise).then(
      (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

// One typed PIN (decided 2026-11-02 A1 / L1; timeout rule 2026-11-10 A).
// deps (lib/pinCheck.js wires SecureStore and the server):
//   readLock() -> lock | null          writeLock(lock | null)
//   match(pin) -> true | false | null  (null = no check value saved)
//   isOnline() -> boolean              refresh() -> true when the server
//                                      answered and the value was saved
// -> { state: "ok" }              right PIN: camera opens
//    { state: "unknown" }         couldn't be checked: camera opens, the
//                                 server checks the PIN when the punch syncs
//    { state: "failed", err }     wrong PIN or locked
// A saved value that matches never waits on the network. Otherwise the
// network gets PIN_CHECK_DEADLINE_MS in total. A PIN is only called wrong
// by a fresh value from the server, or by the saved one when the phone
// knows it is offline - never because the server was slow or failed.
async function runPinCheck({ pin, readLock, writeLock, match, isOnline, refresh, now = Date.now, deadlineMs = PIN_CHECK_DEADLINE_MS }) {
  const lock = await readLock();
  const seconds = lockSecondsLeftAt(lock, now());
  if (seconds > 0) return { state: "failed", err: lockedError(seconds) };

  let ok = await match(pin);
  if (ok !== true) {
    const start = now();
    const left = () => start + deadlineMs - now();
    // Unknown connection counts as online (same as isOnline itself).
    const online = await withinDeadline(isOnline(), left(), true);
    const fresh = online !== false && (await withinDeadline(refresh(), left(), false)) === true;
    if (fresh) {
      ok = await match(pin);
      if (ok === null) return { state: "unknown" };
    } else if (ok === null || online !== false) {
      // No value to check against, or online but the server didn't answer
      // in time: not a wrong PIN.
      return { state: "unknown" };
    }
    // Offline with a saved value that doesn't match: wrong (as before).
  }
  if (ok) {
    if (lock) await writeLock(null);
    return { state: "ok" };
  }
  const next = afterWrongPin(lock, now());
  await writeLock(next.lock);
  return { state: "failed", err: next.error };
}

module.exports = {
  PIN_MAX_WRONG,
  PIN_LOCK_MS,
  PIN_CHECK_DEADLINE_MS,
  withinDeadline,
  runPinCheck,
  VERIFIER_VERSION,
  hashInput,
  parseVerifier,
  readSavedVerifier,
  hashesMatch,
  readSavedLock,
  lockSecondsLeftAt,
  lockedMessage,
  wrongPinMessage,
  lockedError,
  afterWrongPin,
};
