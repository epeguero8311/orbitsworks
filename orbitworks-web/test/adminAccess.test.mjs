// Task 4 (Admin Permissions) - lib/adminAccess.ts + its functions copy.
// Plain Node. Run via: node --test test/adminAccess.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveAdminAccess,
  hasPermission,
  canAccessSite,
  hasNoAccess,
  accessClaimsFor,
  canManageAdmin,
  LEGACY_ADMIN_PERMISSIONS,
  NO_PERMISSIONS,
} from "../lib/adminAccess.ts";
const { setAdminAccessSchema } = await import("../lib/validators/adminAccess.ts");

test("parity: functions/src/adminAccessModel.ts is an exact copy (after its 3-line header)", () => {
  const web = readFileSync(new URL("../lib/adminAccess.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const fn = readFileSync(new URL("../functions/src/adminAccessModel.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(fn.split("\n").slice(3).join("\n"), web);
});

test("legacy admin (no stored access) = all sites + every permission but Billing (D6/D8)", () => {
  const a = resolveAdminAccess("admin", undefined);
  assert.equal(a.legacy, true);
  assert.equal(a.sites, "all");
  assert.deepEqual(a.permissions, LEGACY_ADMIN_PERMISSIONS);
  assert.equal(hasPermission(a, "billing"), false);
  assert.equal(hasPermission(a, "exportPayroll"), true);
  assert.deepEqual(accessClaimsFor(a), { lvl: "admin", allSites: true, perms: ["ah", "em", "pay", "exp", "an", "set", "inv"] });
});

test("owner + Full access: everything; restricted admin: their sites incl. Unassigned", () => {
  for (const a of [resolveAdminAccess("owner", null), resolveAdminAccess("admin", { level: "full", sites: ["x"] })]) {
    assert.equal(hasPermission(a, "billing"), true);
    assert.equal(canAccessSite(a, "anything"), true);
    assert.equal(canAccessSite(a, null), true);
  }
  const r = resolveAdminAccess("admin", { level: "admin", sites: ["A", "unassigned"], permissions: { approveHours: true } });
  assert.equal(canAccessSite(r, "A"), true);
  assert.equal(canAccessSite(r, "C"), false);
  assert.equal(canAccessSite(r, null), true);
  assert.equal(hasPermission(r, "approveHours"), true);
  assert.equal(hasPermission(r, "editPay"), false);
  assert.deepEqual(accessClaimsFor(r), { lvl: "admin", allSites: false, perms: ["ah"] });
  const noUnassigned = resolveAdminAccess("admin", { level: "admin", sites: ["A"], permissions: {} });
  assert.equal(canAccessSite(noUnassigned, null), false);
});

test("No access yet (D9) + supervisors/employees get nothing here", () => {
  assert.equal(hasNoAccess(resolveAdminAccess("admin", { level: "admin", sites: [], permissions: NO_PERMISSIONS })), true);
  assert.equal(hasNoAccess(resolveAdminAccess("admin", { level: "admin", sites: ["A"], permissions: NO_PERMISSIONS })), false);
  assert.equal(hasNoAccess(resolveAdminAccess("admin", undefined)), false);
  assert.equal(hasPermission(resolveAdminAccess("supervisor", null), "approveHours"), false);
});

test("hierarchy (D5)", () => {
  const owner = resolveAdminAccess("owner", null);
  const full = resolveAdminAccess("admin", { level: "full" });
  const adm = resolveAdminAccess("admin", { level: "admin", sites: "all", permissions: { invites: true } });
  const legacy = resolveAdminAccess("admin", undefined);
  const ok = (caller, target, nextLevel, same = false) =>
    canManageAdmin({ callerUid: "c", caller, targetUid: same ? "c" : "t", target, nextLevel }).ok;
  assert.equal(ok(owner, full, "admin"), true);
  assert.equal(ok(owner, adm, "full"), true);
  assert.equal(ok(full, adm, "admin"), true);
  assert.equal(ok(full, adm, "full"), false);
  assert.equal(ok(full, full, "admin"), false);
  assert.equal(ok(adm, adm, "admin"), false);
  assert.equal(ok(legacy, adm, "admin"), false);
  assert.equal(ok(full, owner, "admin"), false);
  assert.equal(ok(owner, owner, "admin"), false);
  assert.equal(ok(full, adm, "admin", true), false);
});

test("validator", () => {
  const base = { targetUid: "u", level: "admin", sites: ["A"], permissions: { ...NO_PERMISSIONS } };
  assert.equal(setAdminAccessSchema.safeParse(base).success, true);
  assert.equal(setAdminAccessSchema.safeParse({ ...base, sites: "all" }).success, true);
  assert.equal(setAdminAccessSchema.safeParse({ ...base, sites: ["A", "A"] }).success, false);
  assert.equal(setAdminAccessSchema.safeParse({ ...base, level: "owner" }).success, false);
  assert.equal(setAdminAccessSchema.safeParse({ ...base, permissions: { approveHours: true } }).success, false);
});
