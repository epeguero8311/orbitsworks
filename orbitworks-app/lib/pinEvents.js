// Pub/sub for "the local employee/PIN cache changed" - lets any screen
// showing cached employee info (name, photo) refresh the instant a sync
// finishes, rather than waiting on its own next mount/focus.
const listeners = new Set();

export function subscribePinTableChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function notifyPinTableChange() {
  listeners.forEach((cb) => cb());
}