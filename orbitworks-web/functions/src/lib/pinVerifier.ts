import { createHash, randomBytes } from "crypto";

// ---- Employee App: PIN check on the phone (decided 2026-11-02, A1) ----
//
// The phone checks the PIN itself (online and offline) against a salted
// SHA-256 of this employee's own PIN, so a wrong PIN shows at once. The
// server still checks the real PIN on every punch it receives.
//
// hash = sha256_hex(salt + ":" + pin). A new random salt every time it is
// handed out, so each phone's copy is different and a ready-made table of
// hashed PINs is useless. A 4-digit PIN has only 10,000 options, so anyone
// who gets this value off the phone could still try them all - the phone
// keeps it in SecureStore (encrypted, this app only). The phone's
// lib/pinVerifier.js must build the same string.

export const PIN_VERIFIER_VERSION = 1;
const SALT_BYTES = 16;

export type PinVerifierResult =
  | { status: "ok"; v: typeof PIN_VERIFIER_VERSION; salt: string; hash: string }
  // No usable PIN on the employee doc: the phone falls back to the server
  // checking the PIN at sync.
  | { status: "noPin" }
  | { status: "inactive" };

export function pinVerifierHash(salt: string, pin: string): string {
  return createHash("sha256").update(`${salt}:${pin}`, "utf8").digest("hex");
}

export function makePinVerifier(pin: unknown): PinVerifierResult {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) return { status: "noPin" };
  const salt = randomBytes(SALT_BYTES).toString("base64url");
  return { status: "ok", v: PIN_VERIFIER_VERSION, salt, hash: pinVerifierHash(salt, pin) };
}
