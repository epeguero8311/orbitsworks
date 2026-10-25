const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../lib/validators/joinSignup");
const s = require("../lib/sentryScrub");

const NOW = new Date(Date.UTC(2026, 9, 25, 12));

test("full name: 2-100 chars, trimmed", () => {
  assert.equal(v.validateFullName(" A ").ok, false);
  assert.equal(v.validateFullName("Al").ok, true);
  assert.equal(v.validateFullName("  Ana Ruiz ").value, "Ana Ruiz");
  assert.equal(v.validateFullName("x".repeat(101)).ok, false);
});

test("email: lowercased, must look like an email", () => {
  assert.equal(v.validateEmail(" Ana@Example.COM ").value, "ana@example.com");
  assert.equal(v.validateEmail("ana@example").ok, false);
  assert.equal(v.validateEmail("").ok, false);
  assert.equal(v.validateEmail("a@" + "b".repeat(250) + ".co").ok, false);
});

test("password: 8-128 like joinCompany", () => {
  assert.equal(v.validatePassword("1234567").ok, false);
  assert.equal(v.validatePassword("12345678").ok, true);
  assert.equal(v.validatePassword("x".repeat(129)).ok, false);
});

test("birthday: impossible dates rejected", () => {
  for (const b of [
    { mm: "02", dd: "30", yyyy: "1995" },
    { mm: "13", dd: "01", yyyy: "1995" },
    { mm: "00", dd: "10", yyyy: "1995" },
    { mm: "04", dd: "31", yyyy: "1995" },
    { mm: "02", dd: "29", yyyy: "2001" },
    { mm: "01", dd: "01", yyyy: "2030" },
    { mm: "01", dd: "01", yyyy: "1890" },
  ]) {
    assert.deepEqual(v.checkBirthday(b, 16, NOW), { ok: false, error: "Enter a real date of birth." }, JSON.stringify(b));
  }
});

test("birthday: missing boxes get their own message", () => {
  assert.equal(v.checkBirthday({ mm: "1", dd: "", yyyy: "1995" }, 16, NOW).error, "Enter your full date of birth.");
  assert.equal(v.checkBirthday({ mm: "1", dd: "2", yyyy: "95" }, 16, NOW).error, "Enter your full date of birth.");
});

test("birthday: under min age blocked, birthday-day boundary", () => {
  assert.equal(v.checkBirthday({ mm: "10", dd: "26", yyyy: "2010" }, 16, NOW).error, "You must be at least 16 to sign up.");
  assert.deepEqual(v.checkBirthday({ mm: "10", dd: "25", yyyy: "2010" }, 16, NOW), { ok: true, iso: "2010-10-25" });
  assert.deepEqual(v.checkBirthday({ mm: "2", dd: "29", yyyy: "1996" }, 16, NOW), { ok: true, iso: "1996-02-29" });
  assert.equal(v.checkBirthday({ mm: "01", dd: "01", yyyy: "2009" }, 18, NOW).error, "You must be at least 18 to sign up.");
});

test("selfie size: 4 MB limit on decoded bytes", () => {
  const under = "A".repeat(Math.floor((v.SELFIE_MAX_BYTES / 3) * 4));
  assert.equal(v.selfieTooLarge(under), false);
  assert.equal(v.selfieTooLarge(under + "AAAA"), true);
});

test("errors: accountProblem shows the same dead-end as inactive", () => {
  const a = v.mapJoinError({ details: { reason: "inactive" } });
  const b = v.mapJoinError({ details: { reason: "accountProblem" } });
  assert.deepEqual(a, b);
  assert.equal(a.kind, "inactive");
});

test("errors: every joinCompany reason maps somewhere sensible", () => {
  assert.equal(v.mapJoinError({ details: { reason: "consentVersion" } }).kind, "consent");
  assert.equal(v.mapJoinError({ details: { reason: "emailInUse" } }).kind, "email");
  assert.equal(v.mapJoinError({ details: { reason: "subcontractor" } }).kind, "subcontractor");
  assert.equal(v.mapJoinError({ details: { reason: "photo" } }).kind, "photo");
  assert.equal(v.mapJoinError({ details: { reason: "generic" } }).kind, "retry");
  assert.deepEqual(v.mapJoinError({ details: { reason: "invalid" }, message: "Enter a real date of birth." }), { kind: "field", message: "Enter a real date of birth." });
});

test("errors: no reason (network, internal) means retry, never dead-end", () => {
  assert.equal(v.mapJoinError({ code: "functions/internal", message: "internal" }).kind, "retry");
  assert.equal(v.mapJoinError(new Error("Network request failed")).kind, "retry");
  assert.equal(v.mapJoinError(undefined).kind, "retry");
});

test("parseJoinInfo: inactive, active, and junk", () => {
  assert.deepEqual(v.parseJoinInfo({ status: "inactive" }), { status: "inactive" });
  const active = {
    status: "active", companyName: "Acme", subcontractors: [{ id: "s1", name: "Bolt", extra: 1 }],
    privacyPolicyVersion: "p", biometricConsentVersion: "b", biometricConsentText: "t", minSignupAge: 16,
  };
  assert.deepEqual(v.parseJoinInfo(active).subcontractors, [{ id: "s1", name: "Bolt" }]);
  assert.equal(v.parseJoinInfo({ status: "active" }), null);
  assert.equal(v.parseJoinInfo(null), null);
  assert.equal(v.parseJoinInfo({ ...active, minSignupAge: "16" }), null);
});

test("sentryScrub: blanks registered values in nested strings, leaves numbers", () => {
  s.clearScrubValues();
  s.setScrubValue("pin", "4821");
  s.setScrubValue("email", "ana@example.com");
  const event = {
    message: "PIN 4821 for ana@example.com",
    breadcrumbs: [{ message: "console: 4821", data: { arguments: ["x ana@example.com"] } }],
    timestamp: 17614821,
  };
  const out = s.scrubSensitive(event);
  assert.equal(out.message, "PIN [redacted] for [redacted]");
  assert.equal(out.breadcrumbs[0].message, "console: [redacted]");
  assert.equal(out.breadcrumbs[0].data.arguments[0], "x [redacted]");
  assert.equal(out.timestamp, 17614821);
  s.clearScrubValues(["pin"]);
  assert.equal(s.scrubSensitive({ m: "4821" }).m, "4821");
  s.clearScrubValues();
});

test("sentryScrub: ignores values shorter than 4", () => {
  s.clearScrubValues();
  s.setScrubValue("x", "12");
  assert.equal(s.scrubSensitive({ m: "12" }).m, "12");
});
