// Employee App - the employee's own PIN kept on the phone for the Settings
// tab (decided 2026-11-06, D1 revised: shown plainly, no Show step, no
// server call on the screen). lib/pinCheck.js saves it in SecureStore
// (encrypted, this device only, only while unlocked) next to the PIN check
// value, refreshes it at the same times, and deletes it on log out. No
// React Native or Expo imports so test/savedPin.test.js runs it under
// `node --test`.
//   record = { status: "ok", pin } | { status: "noPin" } | { status: "inactive" }

const PIN_PATTERN = /^\d{4}$/;
// Shown when nothing is saved yet (e.g. first sign-in with no signal).
const PIN_NOT_LOADED = "Connect to the internet once to load your PIN";

function okRecord(pin) {
  return typeof pin === "string" && PIN_PATTERN.test(pin) ? { status: "ok", pin } : null;
}

// getMyPin's answer -> the record to save, or null (nothing usable: the
// caller deletes any stale copy).
function savedPinFromResult(result) {
  if (!result || typeof result !== "object") return null;
  if (result.status === "ok") return okRecord(result.pin);
  if (result.status === "noPin" || result.status === "inactive") return { status: result.status };
  return null;
}

// What getMyPinVerifier's answer says about the saved PIN without asking
// getMyPin: noPin / inactive are known from the verifier itself.
//   -> record to save | "check" (ok: compare the saved PIN to the new hash)
//      | null (unusable answer: leave things as they are)
function savedPinFromVerifier(parsed) {
  if (!parsed) return null;
  if (parsed.status === "noPin" || parsed.status === "inactive") return { status: parsed.status };
  return parsed.status === "ok" ? "check" : null;
}

function serializeSavedPin(record) {
  return record ? JSON.stringify(record) : null;
}

// SecureStore text -> record or null. Anything malformed counts as none.
function readSavedPin(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    if (value.status === "ok") return okRecord(value.pin);
    if (value.status === "noPin" || value.status === "inactive") return { status: value.status };
    return null;
  } catch {
    return null;
  }
}

// The Settings PIN row's text. Never blank.
function savedPinText(record) {
  if (record && record.status === "ok" && okRecord(record.pin)) return record.pin;
  if (record && record.status === "noPin") return "Not set - ask your admin";
  if (record && record.status === "inactive") return "Your account is inactive";
  return PIN_NOT_LOADED;
}

module.exports = {
  PIN_NOT_LOADED,
  savedPinFromResult,
  savedPinFromVerifier,
  serializeSavedPin,
  readSavedPin,
  savedPinText,
};
