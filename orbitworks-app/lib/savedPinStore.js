// Employee App - the employee's own PIN saved on the phone for the Settings
// tab (D1 revised 2026-11-06; fixes 2026-11-11). No React Native, Expo or
// Firebase imports, so test/savedPinStore.test.js runs it under
// `node --test`. lib/pinCheck.js wires it to SecureStore and getMyPin.
//
// When it is saved:
//   - after sign-up: the PIN from the joinCompany answer is kept in memory
//     (rememberJoinedPin) and saved once a fresh check hash confirms it -
//     a new joiner never needs getMyPin
//   - after every fresh check hash (syncAfterVerifier): a saved PIN that
//     still matches is kept; otherwise getMyPin is asked once (calls at
//     the same time share one request) and its answer saved
//   - Settings with nothing saved, online: ensureSaved asks once
// A failed getMyPin never removes a saved PIN that still matches the
// current hash (a call running alongside may have just saved it). Only a
// PIN confirmed wrong for the current hash is removed, so a stale PIN is
// never shown. Log out removes it (forget).

const { readSavedPin, savedPinFromResult, savedPinFromVerifier, serializeSavedPin } = require("./savedPin");

const PIN_PATTERN = /^\d{4}$/;

// deps:
//   readItem(key) -> string | null       writeItem(key, string | null)
//   fetchPin() -> getMyPin's answer (throws on failure)
//   matches(pin, verifier) -> boolean    verifier = { salt, hash }
function createSavedPinStore({ readItem, writeItem, fetchPin, matches }) {
  const keyFor = (companyId, employeeId) => `myPin.${companyId}.${employeeId}`;
  const listeners = new Set();
  const fetching = new Map(); // key -> Promise<record | null>
  const syncing = new Map(); // key -> Set<Promise>
  let joinedPin = null; // memory only, until a fresh hash confirms it

  function notify() {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A listener's own problem never stops the others.
      }
    }
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function read(companyId, employeeId) {
    if (!companyId || !employeeId) return null;
    return readSavedPin(await readItem(keyFor(companyId, employeeId)));
  }

  async function save(companyId, employeeId, record) {
    await writeItem(keyFor(companyId, employeeId), serializeSavedPin(record));
    notify();
  }

  // One getMyPin at a time per employee; callers share it. -> record or
  // null when it failed or the answer wasn't usable.
  function fetchShared(companyId, employeeId) {
    const key = keyFor(companyId, employeeId);
    if (fetching.has(key)) return fetching.get(key);
    const run = (async () => {
      try {
        return savedPinFromResult(await fetchPin());
      } catch {
        return null;
      }
    })().finally(() => fetching.delete(key));
    fetching.set(key, run);
    return run;
  }

  async function matchesHash(record, verifier) {
    return !!record && record.status === "ok" && (await matches(record.pin, verifier));
  }

  async function syncOnce(companyId, employeeId, parsed) {
    const fromVerifier = savedPinFromVerifier(parsed);
    if (fromVerifier === null) return;
    if (fromVerifier !== "check") {
      await save(companyId, employeeId, fromVerifier);
      return;
    }
    if (await matchesHash(await read(companyId, employeeId), parsed)) return;

    if (joinedPin) {
      const pin = joinedPin;
      joinedPin = null;
      if (await matches(pin, parsed)) {
        await save(companyId, employeeId, { status: "ok", pin });
        return;
      }
    }

    const record = await fetchShared(companyId, employeeId);
    if (record) {
      await save(companyId, employeeId, record);
      return;
    }
    // getMyPin failed: keep a saved PIN that matches (maybe saved by a call
    // running alongside); remove one that is wrong for the current PIN.
    const saved = await read(companyId, employeeId);
    if (saved && !(await matchesHash(saved, parsed))) await save(companyId, employeeId, null);
  }

  // After a fresh check hash (getMyPinVerifier's parsed answer).
  function syncAfterVerifier(companyId, employeeId, parsed) {
    if (!companyId || !employeeId) return Promise.resolve();
    const key = keyFor(companyId, employeeId);
    const run = syncOnce(companyId, employeeId, parsed);
    if (!syncing.has(key)) syncing.set(key, new Set());
    const runs = syncing.get(key);
    runs.add(run);
    run
      .catch(() => {})
      .finally(() => {
        runs.delete(run);
        if (runs.size === 0) syncing.delete(key);
      });
    return run;
  }

  // Resolves when every save running for this employee has finished.
  async function idle(companyId, employeeId) {
    const runs = syncing.get(keyFor(companyId, employeeId));
    if (runs) await Promise.allSettled([...runs]);
  }

  // Settings with nothing saved: refresh() gets a fresh check hash (which
  // starts syncAfterVerifier), then wait for that save to finish.
  async function ensureSaved(companyId, employeeId, refresh) {
    if (!companyId || !employeeId) return;
    if (await read(companyId, employeeId)) return;
    try {
      await refresh();
    } catch {
      return;
    }
    await idle(companyId, employeeId);
  }

  // Sign-up just finished: the PIN from the joinCompany answer.
  function rememberJoinedPin(pin) {
    joinedPin = typeof pin === "string" && PIN_PATTERN.test(pin) ? pin : null;
  }

  async function forget(companyId, employeeId) {
    joinedPin = null;
    if (!companyId || !employeeId) return;
    await save(companyId, employeeId, null);
  }

  return { read, onChange, syncAfterVerifier, idle, ensureSaved, rememberJoinedPin, forget };
}

module.exports = { createSavedPinStore };
