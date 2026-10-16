// Minimal in-memory pub/sub, same shape as queueEvents.js - lets the
// Dashboard's alert bell badge update the instant a decline is recorded,
// without waiting for a screen focus event.
const listeners = new Set();

export function subscribeDeclinedChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function notifyDeclinedChange() {
  listeners.forEach((cb) => cb());
}
