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
