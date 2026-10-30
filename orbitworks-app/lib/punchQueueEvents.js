// Employee App Phase 4 - tiny in-memory pub/sub for the offline punch
// queue (same idea as the supervisor's queueEvents.js, kept separate):
//   - queue changes: Home, the Sync tab, the badge and Settings re-read
//     the queue the moment a punch is saved, sent, failed or removed
//   - weak signal: set when an online call times out, so the connection
//     banner shows even while the phone still reports a connection

const queueListeners = new Set();

export function subscribePunchQueue(callback) {
  queueListeners.add(callback);
  return () => queueListeners.delete(callback);
}

export function notifyPunchQueue() {
  queueListeners.forEach((cb) => cb());
}

// "Send now": a punch was just saved or redone. usePunchQueueSync listens.
// Separate from queue changes, which also fire while a sync runs.
const kickListeners = new Set();

export function subscribeSyncKick(callback) {
  kickListeners.add(callback);
  return () => kickListeners.delete(callback);
}

export function kickPunchSync() {
  kickListeners.forEach((cb) => cb());
}

// The banner stays up this long after the last timeout, unless a call
// gets through first.
const WEAK_SIGNAL_SHOW_MS = 2 * 60 * 1000;
let weakSignalAt = 0;
const signalListeners = new Set();

function notifySignal() {
  signalListeners.forEach((cb) => cb());
}

export function noteWeakSignal() {
  weakSignalAt = Date.now();
  notifySignal();
}

export function noteSignalOk() {
  if (weakSignalAt === 0) return;
  weakSignalAt = 0;
  notifySignal();
}

export function isWeakSignal(nowMs = Date.now()) {
  return weakSignalAt > 0 && nowMs - weakSignalAt < WEAK_SIGNAL_SHOW_MS;
}

export function weakSignalEndsAt() {
  return weakSignalAt > 0 ? weakSignalAt + WEAK_SIGNAL_SHOW_MS : 0;
}

export function subscribeSignal(callback) {
  signalListeners.add(callback);
  return () => signalListeners.delete(callback);
}
