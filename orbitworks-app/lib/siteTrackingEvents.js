// Employee App Phase 8 - "check leave tracking again now" (after the
// location consent / Always steps finish), so Home starts tracking without
// waiting for the next time the app comes to the front.
const listeners = new Set();

export function subscribeTrackingKick(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function kickTrackingCheck() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // A listener's own problem.
    }
  }
}
