// Phase 9 - the one invite form (lib/validators/employeeInvite.ts
// inviteFormSchema). Plain Node, no emulator.
// Run via: node --test test/inviteForm.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { inviteFormSchema } from "../lib/validators/employeeInvite.ts";

const parse = (v) => inviteFormSchema.safeParse(v);

test("each role takes its own fields; email lowercased and trimmed", () => {
  const e = parse({ role: "employee", email: " Ana@Mail.com ", siteId: "site1" });
  assert.ok(e.success);
  assert.equal(e.data.email, "ana@mail.com");
  assert.ok(parse({ role: "employee", email: "a@b.co", siteId: null }).success);
  assert.ok(parse({ role: "supervisor", email: "a@b.co", siteIds: ["s1", "s2"] }).success);
  assert.ok(parse({ role: "supervisor", email: "a@b.co", siteIds: [] }).success);
  assert.ok(parse({ role: "admin", email: "a@b.co" }).success);
});

test("bad email, unknown role and missing role fields fail", () => {
  assert.ok(!parse({ role: "employee", email: "nope", siteId: null }).success);
  assert.ok(!parse({ role: "owner", email: "a@b.co" }).success);
  assert.ok(!parse({ role: "supervisor", email: "a@b.co" }).success);
  assert.ok(!parse({ role: "employee", email: "a@b.co" }).success);
  assert.ok(!parse({ role: "supervisor", email: "a@b.co", siteIds: ["bad id!"] }).success);
});
