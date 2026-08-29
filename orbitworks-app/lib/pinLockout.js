// Local rate limiting for offline PIN attempts, mirroring the server's
// verifyPin window (5 attempts / 60 seconds). Resets on app restart -
// that is a known gap, not a full fix. The real defense against a lost
// or stolen device is still "do not lose the device" - this just stops
// someone from rapid-fire guessing all 10,000 possible 4-digit PINs.
let count = 0;
let windowStart = 0;
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export function checkPinLockout() {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    count = 0;
    windowStart = now;
  }
  if (count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((windowStart + WINDOW_MS - now) / 1000);
    return { locked: true, retryAfterSeconds };
  }
  return { locked: false };
}

export function recordPinAttempt() {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    count = 0;
    windowStart = now;
  }
  count += 1;
}

export function resetPinLockout() {
  count = 0;
  windowStart = 0;
}