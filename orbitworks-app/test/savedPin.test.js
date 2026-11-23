// Employee App - the PIN saved on the phone for the Settings tab
// (lib/savedPin.js, D1 revised 2026-11-06).
// Run: node --test test/savedPin.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../lib/savedPin");

test("Settings row text: the PIN plainly; noPin / inactive; never blank when nothing is saved", () => {
  assert.equal(p.savedPinText({ status: "ok", pin: "4821" }), "4821");
  assert.equal(p.savedPinText({ status: "ok", pin: "0007" }), "0007", "leading zeros kept");
  assert.equal(p.savedPinText({ status: "noPin" }), "Not set - ask your admin");
  assert.equal(p.savedPinText({ status: "inactive" }), "Your account is inactive");
  assert.equal(p.savedPinText(null), "Connect to the internet once to load your PIN");
  assert.equal(p.savedPinText({ status: "ok", pin: "12" }), p.PIN_NOT_LOADED, "a bad saved value is never shown");
});

test("getMyPin answer -> record to save; anything else -> null (stale copy deleted)", () => {
  assert.deepEqual(p.savedPinFromResult({ status: "ok", pin: "4821" }), { status: "ok", pin: "4821" });
  assert.deepEqual(p.savedPinFromResult({ status: "noPin" }), { status: "noPin" });
  assert.deepEqual(p.savedPinFromResult({ status: "inactive" }), { status: "inactive" });
  assert.equal(p.savedPinFromResult({ status: "ok" }), null);
  assert.equal(p.savedPinFromResult({ status: "ok", pin: "48211" }), null);
  assert.equal(p.savedPinFromResult(null), null);
});

test("verifier answer: noPin / inactive saved at once; ok -> compare the saved PIN; unusable -> leave as is", () => {
  assert.deepEqual(p.savedPinFromVerifier({ status: "noPin" }), { status: "noPin" });
  assert.deepEqual(p.savedPinFromVerifier({ status: "inactive" }), { status: "inactive" });
  assert.equal(p.savedPinFromVerifier({ status: "ok", salt: "s", hash: "h" }), "check");
  assert.equal(p.savedPinFromVerifier(null), null);
});

test("SecureStore round trip; malformed text counts as nothing saved", () => {
  for (const rec of [{ status: "ok", pin: "4821" }, { status: "noPin" }, { status: "inactive" }]) {
    assert.deepEqual(p.readSavedPin(p.serializeSavedPin(rec)), rec);
  }
  assert.equal(p.serializeSavedPin(null), null, "null = delete the key");
  for (const raw of [null, "", "not json", "[]", "{}", '{"status":"ok","pin":4821}', '{"status":"ok","pin":"abcd"}']) {
    assert.equal(p.readSavedPin(raw), null, String(raw));
  }
});
