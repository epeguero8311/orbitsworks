// Phase 3B - employeeInviteValidators.ts (email invite inputs). Pure zod,
// no emulator. Runs the compiled lib/ (npm run build first).
// Run: node --test test/employeeInviteValidators.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const v = require("../lib/employeeInviteValidators");
const { inviteDisplayStatus } = require("../lib/employeeInviteTypes");

const TOKEN = randomBytes(v.INVITE_TOKEN_BYTES).toString("base64url");
const ok = (schema, input) => schema.safeParse(input).success;

test("generated token is 43 chars and passes the token rule", () => {
  assert.equal(TOKEN.length, 43);
  assert.ok(ok(v.employeeInviteTokenSchema, { token: TOKEN }));
  assert.ok(ok(v.getInviteInfoSchema, { token: TOKEN }));
});

test("token rule rejects short, long, odd chars and wrong types", () => {
  for (const token of ["short", "a".repeat(31), "a".repeat(129), TOKEN.slice(0, 40) + "!!!", `${TOKEN}/x`, 12345, null, undefined]) {
    assert.equal(ok(v.getInviteInfoSchema, { token }), false, String(token));
  }
  assert.equal(ok(v.getInviteInfoSchema, null), false);
});

test("create: existingEmployee needs employeeId + email, lowercases the email", () => {
  const r = v.createEmployeeInviteSchema.safeParse({ kind: "existingEmployee", employeeId: "emp-1", email: "  Ana@Gmail.COM " });
  assert.ok(r.success);
  assert.equal(r.data.email, "ana@gmail.com");
  assert.equal(ok(v.createEmployeeInviteSchema, { kind: "existingEmployee", email: "a@b.co" }), false);
  assert.equal(ok(v.createEmployeeInviteSchema, { kind: "existingEmployee", employeeId: "emp-1" }), false);
  assert.equal(ok(v.createEmployeeInviteSchema, { kind: "existingEmployee", employeeId: "../x", email: "a@b.co" }), false);
  assert.equal(ok(v.createEmployeeInviteSchema, { kind: "existingEmployee", employeeId: "", email: "a@b.co" }), false);
});

test("create: existingEmployee drops a siteId (row keeps its own sites)", () => {
  const r = v.createEmployeeInviteSchema.safeParse({ kind: "existingEmployee", employeeId: "emp-1", email: "a@b.co", siteId: "site-x" });
  assert.ok(r.success);
  assert.equal("siteId" in r.data, false);
});

test("create: newPerson takes a site or null, siteId is required", () => {
  assert.ok(ok(v.createEmployeeInviteSchema, { kind: "newPerson", email: "a@b.co", siteId: "site-core" }));
  assert.ok(ok(v.createEmployeeInviteSchema, { kind: "newPerson", email: "a@b.co", siteId: null }));
  assert.equal(ok(v.createEmployeeInviteSchema, { kind: "newPerson", email: "a@b.co" }), false);
  assert.equal(ok(v.createEmployeeInviteSchema, { kind: "newPerson", email: "a@b.co", siteId: "" }), false);
  assert.equal(ok(v.createEmployeeInviteSchema, { kind: "newPerson", email: "not-an-email", siteId: null }), false);
  assert.equal(ok(v.createEmployeeInviteSchema, { kind: "newPerson", email: `${"a".repeat(250)}@b.co`, siteId: null }), false);
});

test("create: unknown kind or no kind is rejected", () => {
  assert.equal(ok(v.createEmployeeInviteSchema, { kind: "supervisor", email: "a@b.co", siteId: null }), false);
  assert.equal(ok(v.createEmployeeInviteSchema, { email: "a@b.co", siteId: null }), false);
  assert.equal(ok(v.createEmployeeInviteSchema, undefined), false);
});

function acceptInput(over = {}) {
  return {
    token: TOKEN,
    fullName: "Ana Ruiz",
    email: "Ana@Gmail.com",
    password: "longenough1",
    privacyAccepted: true,
    privacyVersion: "p1",
    biometricConsentAccepted: true,
    biometricConsentVersion: "b1",
    birthday: "1990-05-04",
    subcontractorId: null,
    selfieBase64: "AAAA",
    ...over,
  };
}

test("accept: same fields as the QR sign-up, invite token", () => {
  const r = v.acceptEmployeeInviteSchema.safeParse(acceptInput());
  assert.ok(r.success);
  assert.equal(r.data.email, "ana@gmail.com");
  assert.ok(ok(v.acceptEmployeeInviteSchema, acceptInput({ subcontractorId: "sub-core-acme" })));
});

test("accept: every QR rule still applies", () => {
  const bad = [
    { token: "short" },
    { fullName: "A" },
    { email: "nope" },
    { password: "short" },
    { privacyAccepted: false },
    { biometricConsentAccepted: false },
    { birthday: "2023-02-30" },
    { birthday: "2099-01-01" },
    { subcontractorId: "bad/id" },
    { subcontractorId: undefined },
    { selfieBase64: "not base64!" },
  ];
  for (const over of bad) {
    assert.equal(ok(v.acceptEmployeeInviteSchema, acceptInput(over)), false, JSON.stringify(over));
  }
});

test("invite error reasons the app knows", () => {
  assert.deepEqual(Object.keys(v.INVITE_ERRORS).sort(), ["emailMismatch", "inviteInactive", "inviteUnusable"]);
});

test("inviteDisplayStatus: pending past expiry shows expired, others unchanged", () => {
  const at = (ms) => ({ toMillis: () => ms });
  assert.equal(inviteDisplayStatus({ status: "pending", expiresAt: at(2000) }, 1000), "pending");
  assert.equal(inviteDisplayStatus({ status: "pending", expiresAt: at(1000) }, 1000), "expired");
  assert.equal(inviteDisplayStatus({ status: "accepted", expiresAt: at(1) }, 1000), "accepted");
  assert.equal(inviteDisplayStatus({ status: "revoked", expiresAt: at(1) }, 1000), "revoked");
});

// ---- Phase 5d: invite autofill ----

test("5d name edit: accept trims the typed name, same limits as website names (2-100)", () => {
  const r = v.acceptEmployeeInviteSchema.safeParse(acceptInput({ fullName: "  Patricia Row  " }));
  assert.ok(r.success);
  assert.equal(r.data.fullName, "Patricia Row");
  for (const fullName of ["", "   ", "A", " A ", "x".repeat(101), 42, null]) {
    assert.equal(ok(v.acceptEmployeeInviteSchema, acceptInput({ fullName })), false, String(fullName));
  }
  assert.ok(ok(v.acceptEmployeeInviteSchema, acceptInput({ fullName: "x".repeat(100) })));
});

test("5d prefill: clean values pass through, email lowercased + trimmed", () => {
  const r = v.invitePrefillSchema.safeParse({ email: " Pat@Example.COM ", fullName: " Pat Row ", birthday: "1990-01-31", subcontractorId: "subA" });
  assert.ok(r.success);
  assert.deepEqual(r.data, { email: "pat@example.com", fullName: "Pat Row", birthday: "1990-01-31", subcontractorId: "subA" });
});

test("5d prefill: a bad email drops the whole prefill", () => {
  for (const email of ["", "not-an-email", null, undefined, 7]) {
    assert.equal(v.invitePrefillSchema.safeParse({ email, fullName: "Pat Row", birthday: null, subcontractorId: null }).success, false, String(email));
  }
});

test("5d prefill: bad optional fields become null, never junk", () => {
  const r = v.invitePrefillSchema.safeParse({ email: "a@b.co", fullName: "x".repeat(101), birthday: "2023-02-30", subcontractorId: "../x" });
  assert.ok(r.success);
  assert.deepEqual(r.data, { email: "a@b.co", fullName: null, birthday: null, subcontractorId: null });
  const future = v.invitePrefillSchema.parse({ email: "a@b.co", fullName: "A", birthday: "2999-01-01", subcontractorId: 5 });
  assert.deepEqual(future, { email: "a@b.co", fullName: null, birthday: null, subcontractorId: null });
  const missing = v.invitePrefillSchema.parse({ email: "a@b.co" });
  assert.deepEqual(missing, { email: "a@b.co", fullName: null, birthday: null, subcontractorId: null });
});

test("5d prefill: unknown keys are never passed on", () => {
  const r = v.invitePrefillSchema.parse({ email: "a@b.co", fullName: null, birthday: null, subcontractorId: null, pin: "4821", phone: "555" });
  assert.deepEqual(Object.keys(r).sort(), ["birthday", "email", "fullName", "subcontractorId"]);
});
