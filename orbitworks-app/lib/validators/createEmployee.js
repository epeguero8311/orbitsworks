export const EMPLOYEE_NAME_MIN_LENGTH = 1;
export const EMPLOYEE_NAME_MAX_LENGTH = 100;

// Mirrors functions/src/createEmployeePin.ts's JUNK_PINS on orbitworks-web -
// keep both in sync by hand (no shared package across the app/web boundary,
// same convention as lib/validators/device.js). Skips the obvious ones a
// person might guess first (all-repeated-digit, ascending/descending runs,
// the keypad's middle row) so a freshly-created PIN isn't trivially guessable.
export const JUNK_PINS = [
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "0123", "1212", "2580",
];

export function isJunkPin(pin) {
  return JUNK_PINS.includes(pin);
}

export function validateEmployeeName(name) {
  const trimmed = (name ?? "").trim();
  if (trimmed.length < EMPLOYEE_NAME_MIN_LENGTH) {
    return { valid: false, trimmed, error: "Full name is required" };
  }
  if (trimmed.length > EMPLOYEE_NAME_MAX_LENGTH) {
    return {
      valid: false,
      trimmed,
      error: `Name must be ${EMPLOYEE_NAME_MAX_LENGTH} characters or fewer`,
    };
  }
  return { valid: true, trimmed, error: null };
}

// Random 4-digit candidate, skipping the junk list - used both for the
// on-device offline PIN guess (employeeQueue.js) and mirrored server-side
// (functions/src/createEmployeePin.ts) for the authoritative reservation.
export function randomNonJunkPin() {
  let candidate;
  do {
    candidate = Math.floor(1000 + Math.random() * 9000).toString();
  } while (isJunkPin(candidate));
  return candidate;
}
