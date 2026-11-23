import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { isOnline } from "./employeeClockApi";
import { hashesMatch, hashInput, lockSecondsLeftAt, parseVerifier, readSavedLock, readSavedVerifier, runPinCheck } from "./pinVerifier";
import { createSavedPinStore } from "./savedPinStore";

// Employee App - checks a typed PIN on the phone, online or offline
// (decided 2026-11-02, A1 / L1; rules in lib/pinVerifier.js).
//   verifier: salted hash of this employee's own PIN from getMyPinVerifier,
//             kept in SecureStore (encrypted, this app only), refreshed on
//             sign-in, app open, reconnect and after a wrong PIN at sync
//   lock:     3 wrong = 1-minute lock, kept in SecureStore so a restart
//             doesn't reset it
//   saved PIN (D1 revised 2026-11-06): the employee's own PIN for the
//             Settings tab, same SecureStore options, refreshed with the
//             verifier, deleted on log out. A 4-digit PIN behind a salted
//             hash could already be worked out from an unlocked phone, so
//             keeping the PIN itself here adds little. The rules (when it
//             is saved, kept, removed) are in lib/savedPinStore.js; this
//             file only wires it to SecureStore and getMyPin.
// The server still checks the real PIN on every punch. Nothing here is
// ever logged.

const getVerifierFn = httpsCallable(functions, "getMyPinVerifier", { timeout: 15000 });
// 30 s: a cold start is ~5 s and, right after sign-in, the request can
// take 10-15 s to leave the phone (2026-11-11).
const getMyPinFn = httpsCallable(functions, "getMyPin", { timeout: 30000 });
// Only while the phone is unlocked, and never copied to a new phone.
const SECURE_OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const verifierKey = (companyId, employeeId) => `pinVerifier.${companyId}.${employeeId}`;
const lockKey = (companyId, employeeId) => `pinLock.${companyId}.${employeeId}`;

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
      savedPins.syncAfterVerifier(companyId, employeeId, parsed).catch(() => {});
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

// The Settings tab's saved PIN (rules in lib/savedPinStore.js).
const savedPins = createSavedPinStore({
  readItem,
  writeItem,
  fetchPin: async () => (await getMyPinFn({})).data,
  matches: pinMatchesVerifier,
});

// Settings listens so a PIN saved while it's open shows at once.
export const onSavedPinChange = savedPins.onChange;

// The Settings tab's PIN record, or null when none is saved.
export function readSavedPinRecord(companyId, employeeId) {
  return savedPins.read(companyId, employeeId);
}

// Settings opened online with nothing saved: fetch once and wait for it.
export function ensureSavedPin(companyId, employeeId) {
  return savedPins.ensureSaved(companyId, employeeId, () => refreshPinVerifier(companyId, employeeId));
}

// Sign-up just finished (joinCompany's answer): kept in memory and saved
// once the fresh check hash after sign-in confirms it - no getMyPin.
export function rememberJoinedPin(pin) {
  savedPins.rememberJoinedPin(pin);
}

// Log out: the verifier and the saved PIN go (the lock stays, so logging
// out and back in can't skip it).
export async function forgetPinVerifier(companyId, employeeId) {
  if (!companyId || !employeeId) return;
  await writeItem(verifierKey(companyId, employeeId), null);
  await savedPins.forget(companyId, employeeId);
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
//    { state: "unknown" }            not checked here (no verifier, or the
//                                    server didn't answer within 3 s): the
//                                    server checks the PIN at sync
//    { state: "failed", err }        wrong PIN or locked (err shaped like
//                                    the server's: details.reason etc.)
// A saved verifier that matches is instant. Otherwise the phone asks for a
// fresh one (an admin may have just changed the PIN), waiting 3 s at most
// in total. Rules and tests: runPinCheck in lib/pinVerifier.js.
export function checkPinOnPhone({ companyId, employeeId, pin }) {
  const lKey = lockKey(companyId, employeeId);
  return runPinCheck({
    pin,
    readLock: async () => readSavedLock(await readItem(lKey)),
    writeLock: (lock) => writeItem(lKey, lock ? JSON.stringify(lock) : null),
    match: (typed) => matches(companyId, employeeId, typed),
    isOnline,
    refresh: () => refreshPinVerifier(companyId, employeeId),
  });
}
