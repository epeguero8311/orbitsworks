// Minimal in-memory pub/sub so any local queue write can notify every
// screen currently showing overlay-derived status (Breaks, Override,
// Employee List) to refresh immediately - without waiting for a screen
// focus event or a server round trip that may not be possible offline.
const listeners = new Set();

export function subscribeQueueChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function notifyQueueChange() {
  listeners.forEach((cb) => cb());
}