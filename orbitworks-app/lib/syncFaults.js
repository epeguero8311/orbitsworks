// Dev-only fault injection for the offline sync queue (lib/queueSync.js).
// Lets the Sync Queue tab's dev panel force specific failure modes on
// purpose so the fix for the head-of-line-blocking bug can be exercised
// without waiting for a real bad network.
//
// Guarantee that this can never affect a production build, in two
// independent layers:
//
// 1. Every setter below checks __DEV__ before touching state. In a
//    production-mode JS bundle, Expo/Metro replaces the global __DEV__
//    identifier with the literal boolean `false` at bundle time (not an
//    env lookup at runtime) - so `if (!__DEV__) return;` is not a
//    judgment call, it is dead code with a hardcoded outcome. Calling a
//    setter from a production build is a no-op.
//
// 2. Every call site in queueSync.js that reads a fault flag is itself
//    wrapped in `if (__DEV__ && ...)`. Because __DEV__ is that same
//    compile-time literal `false` in a production bundle, those branches
//    are unreachable, and the default production build (minified via
//    terser) performs dead-code elimination on unreachable `if (false)`
//    blocks - so the fault-injection branches are not merely skipped at
//    runtime, they are not present in the shipped bundle at all. See the
//    production checklist for the exact grep that verifies this.
//
// Nothing in this module ever touches the real queue table directly -
// it only flips in-memory switches that queueSync.js chooses to read.

const defaultState = {
  hangUpload: false,
  hangSetDoc: false,
  failSetDoc: false,
  hangWholeDrain: false,
  // null = use queueSync.js's real production timeout/watchdog values.
  // Any number overrides ALL of them (photo fetch/upload/download,
  // Firestore write, and the drain watchdog) uniformly, purely so a
  // human doesn't have to sit through a real 20-60s timeout or a real
  // 5-minute watchdog to see the recovery path fire.
  timeoutOverrideMs: null,
};

let state = { ...defaultState };
const listeners = new Set();

function notify() {
  const snapshot = { ...state };
  listeners.forEach((cb) => cb(snapshot));
}

export function subscribeSyncFaults(callback) {
  if (!__DEV__) return () => {};
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSyncFaults() {
  if (!__DEV__) return { ...defaultState };
  return { ...state };
}

function setFlag(key, value) {
  if (!__DEV__) return;
  state = { ...state, [key]: value };
  notify();
}

export function setHangUpload(value) {
  setFlag("hangUpload", value);
}

export function setHangSetDoc(value) {
  setFlag("hangSetDoc", value);
}

export function setFailSetDoc(value) {
  setFlag("failSetDoc", value);
}

export function setHangWholeDrain(value) {
  setFlag("hangWholeDrain", value);
}

export function setTimeoutOverrideMs(ms) {
  setFlag("timeoutOverrideMs", ms);
}

export function clearAllSyncFaults() {
  if (!__DEV__) return;
  state = { ...defaultState };
  notify();
}

// --- Read-side helpers used only from inside queueSync.js's own
// `if (__DEV__ && ...)` guards. These re-check __DEV__ independently so
// this module is safe even if a call site were ever written without its
// own guard. ---

export function isFaultActive(key) {
  if (!__DEV__) return false;
  return !!state[key];
}

// Falls back to the real production value whenever dev override is
// unset/non-numeric, or outside __DEV__ entirely.
export function resolveTimeoutMs(prodMs) {
  if (!__DEV__) return prodMs;
  const override = state.timeoutOverrideMs;
  return typeof override === "number" && override > 0 ? override : prodMs;
}

// A promise that never settles - simulates "this network call just
// hangs" (dead backhaul, stalled upload, write that never acks) without
// any real network involved. Only ever constructed from inside an
// `if (__DEV__ && isFaultActive(...))` branch in queueSync.js.
export function hangForever() {
  return new Promise(() => {});
}

export function fakePermissionDeniedError() {
  const err = new Error("permission-denied (fault injection: failSetDoc)");
  err.code = "permission-denied";
  return err;
}
