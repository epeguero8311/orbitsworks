// Unit tests for lib/validators/employeeInvite.ts (Phase 3B admin form).
// Plain Node, no emulator. Node 24+ loads the .ts file directly.
// Run via: node --test test/employeeInviteValidators.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { employeeInviteCreateSchema, employeeInviteTokenSchema } from "../lib/validators/employeeInvite.ts";

const ok = (schema, input) => schema.safeParse(input).success;

test("create: both kinds, email lowercased", () => {
  const r = employeeInviteCreateSchema.safeParse({ kind: "newPerson", email: " Ana@Gmail.com ", siteId: null });
  assert.ok(r.success);
  assert.equal(r.data.email, "ana@gmail.com");
  assert.ok(ok(employeeInviteCreateSchema, { kind: "newPerson", email: "a@b.co", siteId: "site-core" }));
  assert.ok(ok(employeeInviteCreateSchema, { kind: "existingEmployee", employeeId: "emp-1", email: "a@b.co" }));
});

test("create: bad input rejected", () => {
  assert.equal(ok(employeeInviteCreateSchema, { kind: "newPerson", email: "nope", siteId: null }), false);
  assert.equal(ok(employeeInviteCreateSchema, { kind: "newPerson", email: "a@b.co" }), false);
  assert.equal(ok(employeeInviteCreateSchema, { kind: "existingEmployee", email: "a@b.co" }), false);
  assert.equal(ok(employeeInviteCreateSchema, { kind: "admin", email: "a@b.co", siteId: null }), false);
});

test("token: server-style 43-char token ok, junk rejected", () => {
  assert.ok(ok(employeeInviteTokenSchema, { token: randomBytes(32).toString("base64url") }));
  assert.equal(ok(employeeInviteTokenSchema, { token: "short" }), false);
  assert.equal(ok(employeeInviteTokenSchema, { token: "a".repeat(129) }), false);
});
