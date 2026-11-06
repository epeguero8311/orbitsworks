import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { isOnline } from "./employeeClockApi";
import { afterWrongPin, hashesMatch, hashInput, lockedError, lockSecondsLeftAt, parseVerifier, readSavedLock, readSavedVerifier } from "./pinVerifier";
import { readSavedPin, savedPinFromResult, savedPinFromVerifier, serializeSavedPin } from "./savedPin";

// Employee App - checks a typed PIN on the phone, online or offline
// (decided 2026-11-02, A1 / L1; rules in lib/pinVerifier.js).
//   verifier: salted hash of this employee's own PIN from getMyPinVerifier,
//             kept in SecureStore (encrypted, this app only), refreshed on
//             sign-in, app open, reconnect and after a wrong PIN at sync
//   lock:     3 wrong = 1-minute lock, kept in SecureStore so a restart
//             doesn't reset it
//   saved PIN (D1 revised 2026-11-06): the employee's own PIN for the
//             Settings tab (lib/savedPin.js), same SecureStore options,
//             refreshed with the verifier, deleted on log out. A 4-digit
//             PIN behind a salted hash could already be worked out from an
//             unlocked phone, so keeping the PIN itself here adds little.
//             getMyPin is only asked when the saved PIN no longer matches
//             the fresh verifier (none saved yet, or an admin changed it).
// The server still checks the real PIN on every punch. Nothing here is
// ever logged.

const getVerifierFn = httpsCallable(functions, "getMyPinVerifier", { timeout: 15000 });
const getMyPinFn = httpsCallable(functions, "getMyPin", { timeout: 15000 });
// Only while the phone is unlocked, and never copied to a new phone.
const SECURE_OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const verifierKey = (companyId, employeeId) => `pinVerifier.${companyId}.${employeeId}`;
const lockKey = (companyId, employeeId) => `pinLock.${companyId}.${employeeId}`;
const savedPinKey = (companyId, employeeId) => `myPin.${companyId}.${employeeId}`;

// Settings listens so a PIN saved while it's open shows at once.
const savedPinListeners = new Set();
export function onSavedPinChange(listener) {
  savedPinListeners.add(listener);
  return () => savedPinListeners.delete(listener);
}
function notifySavedPin() {
  for (const listener of savedPinListeners) {
    try {
      listener();
    } catch {
      // A listener's own problem never stops the others.
    }
  }
}

async function readItem(key) {
  try {
    return await SecureStore.getItemAsync(key, SECURE_OPTS);
  } catch {
    return null;
  }
}

async function writeItem(key, value) {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key, SECURE_OPTS);
    else await SecureStore.setItemAsync(key, value, SECURE_OPTS);
  } catch {
    // Not saved: the next check falls back (no verifier = server checks).
  }
}

const inFlight = new Map();

// Asks the server for a fresh verifier. Resolves true when it answered.
// Calls for the same employee while one is running share it.
export function refreshPinVerifier(companyId, employeeId) {
  if (!companyId || !employeeId) return Promise.resolve(false);
  const key = verifierKey(companyId, employeeId);
  if (inFlight.has(key)) return inFlight.get(key);
  const run = (async () => {
    try {
      const res = await getVerifierFn({});
      const parsed = parseVerifier(res.data);
      if (!parsed) return false;
      await writeItem(key, parsed.status === "ok" ? JSON.stringify({ salt: parsed.salt, hash: parsed.hash }) : null);
      // Not awaited: the saved PIN never delays a PIN check.
      syncSavedPin(companyId, employeeId, parsed).catch(() => {});
      return true;
    } catch {
      return false;
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

async function pinMatchesVerifier(pin, verifier) {
  const typed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hashInput(verifier.salt, pin));
  return hashesMatch(typed.toLowerCase(), verifier.hash);
}

async function writeSavedPin(companyId, employeeId, record) {
  await writeItem(savedPinKey(companyId, employeeId), serializeSavedPin(record));
  notifySavedPin();
}

// After a fresh verifier: keep the saved PIN when it still matches, else
// ask getMyPin once. A failed or refused getMyPin (offline, tooMany)
// deletes a stale PIN rather than show a wrong one.
async function syncSavedPin(companyId, employeeId, parsed) {
  const fromVerifier = savedPinFromVerifier(parsed);
  if (fromVerifier === null) return;
  if (fromVerifier !== "check") {
    await writeSavedPin(companyId, employeeId, fromVerifier);
    return;
  }
  const saved = readSavedPin(await readItem(savedPinKey(companyId, employeeId)));
  if (saved && saved.status === "ok" && (await pinMatchesVerifier(saved.pin, parsed))) return;
  let record = null;
  try {
    record = savedPinFromResult((await getMyPinFn({})).data);
  } catch {
    record = null;
  }
  await writeSavedPin(companyId, employeeId, record);
}

// The Settings tab's PIN record, or null when none is saved.
export async function readSavedPinRecord(companyId, employeeId) {
  if (!companyId || !employeeId) return null;
  return readSavedPin(await readItem(savedPinKey(companyId, employeeId)));
}

// Log out: the verifier and the saved PIN go (the lock stays, so logging
// out and back in can't skip it).
export async function forgetPinVerifier(companyId, employeeId) {
  if (!companyId || !employeeId) return;
  await writeItem(verifierKey(companyId, employeeId), null);
  await writeSavedPin(companyId, employeeId, null);
}

// Seconds left on a saved lock (0 = none), for the PIN screen on open.
export async function pinLockSecondsLeft(companyId, employeeId) {
  return lockSecondsLeftAt(readSavedLock(await readItem(lockKey(companyId, employeeId))), Date.now());
}

async function matches(companyId, employeeId, pin) {
  const verifier = readSavedVerifier(await readItem(verifierKey(companyId, employeeId)));
  if (!verifier) return null;
  return pinMatchesVerifier(pin, verifier);
}

// -> { state: "ok" }                 right PIN
//    { state: "unknown" }            no verifier on the phone: the server
//                                    checks the PIN when the punch syncs
//    { state: "failed", err }        wrong PIN or locked (err shaped like
//                                    the server's: details.reason etc.)
// A wrong PIN while online asks the server for a fresh verifier once (an
// admin may have just changed the PIN) before it counts as wrong.
export async function checkPinOnPhone({ companyId, employeeId, pin }) {
  const lKey = lockKey(companyId, employeeId);
  const lock = readSavedLock(await readItem(lKey));
  const seconds = lockSecondsLeftAt(lock, Date.now());
  if (seconds > 0) return { state: "failed", err: lockedError(seconds) };

  let ok = await matches(companyId, employeeId, pin);
  if (ok === null && (await isOnline()) && (await refreshPinVerifier(companyId, employeeId))) {
    ok = await matches(companyId, employeeId, pin);
  }
  if (ok === null) return { state: "unknown" };
  if (!ok && (await isOnline()) && (await refreshPinVerifier(companyId, employeeId))) {
    ok = await matches(companyId, employeeId, pin);
    if (ok === null) return { state: "unknown" };
  }
  if (ok) {
    if (lock) await writeItem(lKey, null);
    return { state: "ok" };
  }
  const next = afterWrongPin(lock, Date.now());
  await writeItem(lKey, JSON.stringify(next.lock));
  return { state: "failed", err: next.error };
}
