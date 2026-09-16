// A valid backup PIN is exactly 4 digits - no letters, no extra length,
// no leading/trailing whitespace slipped in from a paste.
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
