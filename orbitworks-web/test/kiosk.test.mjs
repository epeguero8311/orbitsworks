// Task 5 (Kiosk mode) - website pure helpers: lib/kiosk.ts, lib/roles.ts,
// lib/employeeInvites/status.ts rowCanBeInvited. Plain Node.
// Run via: node --test test/kiosk.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { formatKeyCountdown, isKioskRecord, kioskToggleBlocker } from "../lib/kiosk.ts";
import { isAppOnlyRole, isStaffRole } from "../lib/roles.ts";
import { rowCanBeInvited } from "../lib/employeeInvites/status.ts";

test("K9: staff allowlist - kiosk/employee/unknown/missing are never staff", () => {
  for (const r of ["owner", "admin", "supervisor"]) assert.equal(isStaffRole(r), true, r);
  for (const r of ["kiosk", "employee", "", null, undefined, "superadmin"]) assert.equal(isStaffRole(r), false, String(r));
});

test("K10: app-only roles never get the dashboard", () => {
  assert.equal(isAppOnlyRole("kiosk"), true);
  assert.equal(isAppOnlyRole("employee"), true);
  for (const r of ["owner", "admin", "supervisor", null]) assert.equal(isAppOnlyRole(r), false);
});

test("Kiosk toggle blockers: Core, Employee App login; an existing kiosk can always turn off", () => {
  assert.equal(kioskToggleBlocker({ isPro: true, appAccess: false, alreadyKiosk: false }), null);
  assert.equal(kioskToggleBlocker({ isPro: false, appAccess: false, alreadyKiosk: false }), "core");
  assert.equal(kioskToggleBlocker({ isPro: true, appAccess: true, alreadyKiosk: false }), "employeeApp");
  assert.equal(kioskToggleBlocker({ isPro: false, appAccess: true, alreadyKiosk: true }), null);
});

test("misc: isKioskRecord, countdown, kiosk rows never get Employee App invites", () => {
  assert.equal(isKioskRecord({ kiosk: true }), true);
  assert.equal(isKioskRecord({}), false);
  assert.equal(formatKeyCountdown(10 * 60 * 1000), "10:00");
  assert.equal(formatKeyCountdown(61_001), "1:02");
  assert.equal(formatKeyCountdown(-5), "0:00");
  assert.equal(rowCanBeInvited({ active: true }), true);
  assert.equal(rowCanBeInvited({ active: true, kiosk: true }), false);
});
