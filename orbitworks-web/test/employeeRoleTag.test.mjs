// Unit tests for lib/employeeRoleTag.ts (Admin / Supervisor / Employee tag).
// Plain Node, no emulator. Node 24+ loads the .ts file directly.
// Run via: node --test test/employeeRoleTag.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { employeeRoleTag } from "../lib/employeeRoleTag.ts";

test("website-only employee (no app login): no tag", () => {
  assert.equal(employeeRoleTag({}), null);
  assert.equal(employeeRoleTag({ isAdmin: false, isSupervisor: false, appAccess: false }), null);
});

test("crew code sign-up (appAccess): grey Employee tag", () => {
  assert.equal(employeeRoleTag({ appAccess: true }), "employee");
  assert.equal(employeeRoleTag({ appAccess: true, isSupervisor: false, isAdmin: false }), "employee");
});

test("supervisor: Supervisor only, with or without an app login", () => {
  assert.equal(employeeRoleTag({ isSupervisor: true }), "supervisor");
  assert.equal(employeeRoleTag({ isSupervisor: true, appAccess: true }), "supervisor");
});

test("admin: Admin only, with or without an app login", () => {
  assert.equal(employeeRoleTag({ isAdmin: true }), "admin");
  assert.equal(employeeRoleTag({ isAdmin: true, appAccess: true }), "admin");
  assert.equal(employeeRoleTag({ isAdmin: true, isSupervisor: true, appAccess: true }), "admin");
});

test("only a real true counts (junk values give no tag)", () => {
  assert.equal(employeeRoleTag({ appAccess: "true" }), null);
  assert.equal(employeeRoleTag({ isSupervisor: 1 }), null);
});
