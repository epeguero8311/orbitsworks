// Minimal in-memory pub/sub, same shape as queueEvents.js - kept separate
// from it since Create Employee queue changes have nothing to do with clock
// event status overlays and don't need to trigger the same listeners.
const listeners = new Set();

export function subscribeEmployeeQueueChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function notifyEmployeeQueueChange() {
  listeners.forEach((cb) => cb());
}
