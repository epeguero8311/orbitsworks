export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function generateUniquePin(existingPins: Set<string>): string {
  let pin = generatePin();
  let attempts = 0;
  while (existingPins.has(pin) && attempts < 50) {
    pin = generatePin();
    attempts += 1;
  }
  return pin;
}

// A valid backup PIN is exactly 4 digits - no letters, no extra length,
// no leading/trailing whitespace slipped in from a paste.
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

// existingPins should already exclude the employee being edited, so this
// only flags a TRUE collision with someone else's current PIN.
export function isPinTaken(candidatePin: string, existingPins: Set<string>): boolean {
  return existingPins.has(candidatePin);
}