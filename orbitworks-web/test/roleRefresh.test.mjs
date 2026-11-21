// RC1 follow-up - lib/roleRefresh.ts (the website's token follows users/{uid}).
// Plain Node, no emulator. Node 24+ loads the .ts file directly.
// Run via: node --test test/roleRefresh.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { tokenRefreshReason, isFatalRefreshError } from "../lib/roleRefresh.ts";

const at = (msValue) => ({ toMillis: () => msValue });
const T = Date.UTC(2026, 10, 20, 0, 23, 15);
const token = (o = {}) => ({ role: "admin", companyId: "c1", iat: Math.floor(T / 1000), ...o });

test("in step: nothing to do (also with old stamps, or none at all)", () => {
  assert.equal(tokenRefreshReason(token(), { role: "admin", companyId: "c1" }), "none");
  assert.equal(tokenRefreshReason(token(), { role: "admin", companyId: "c1", roleChangedAt: at(T - 60000), accessRevokedAt: at(T - 60000) }), "none");
});

test("demoted / promoted while signed in: the doc's role differs from the token -> refresh", () => {
  for (const [from, to] of [["admin", "supervisor"], ["supervisor", "admin"], ["supervisor", "employee"], ["admin", "employee"]]) {
    assert.equal(tokenRefreshReason(token({ role: from }), { role: to, companyId: "c1", roleChangedAt: at(T + 5000) }), "roleMismatch", `${from}->${to}`);
  }
  assert.equal(tokenRefreshReason(token(), { role: "admin", companyId: "c2" }), "roleMismatch");
});

test("changed and changed back (same role, newer stamp) -> refresh once; a token minted after it is fine", () => {
  const doc = { role: "admin", companyId: "c1", roleChangedAt: at(T + 30000) };
  assert.equal(tokenRefreshReason(token(), doc), "roleChanged");
  assert.equal(tokenRefreshReason(token({ iat: Math.floor((T + 31000) / 1000) }), doc), "none");
  // Minted in the same second as the stamp: iat is rounded down, still counts as newer.
  assert.equal(tokenRefreshReason(token({ iat: Math.floor((T + 30000) / 1000) }), { ...doc, roleChangedAt: at(T + 30400) }), "none");
});

test("deactivated while signed in: accessRevokedAt newer than the token wins over everything", () => {
  const doc = { role: "admin", companyId: "c1", accessRevokedAt: at(T + 10000) };
  assert.equal(tokenRefreshReason(token(), doc), "accessRevoked");
  assert.equal(tokenRefreshReason(token({ role: "supervisor" }), doc), "accessRevoked");
  // Reactivated and signed in again later: the new token is newer, nothing to do.
  assert.equal(tokenRefreshReason(token({ iat: Math.floor((T + 3600000) / 1000) }), doc), "none");
});

test("a token with no iat is treated as old", () => {
  assert.equal(tokenRefreshReason({ role: "admin", companyId: "c1" }, { role: "admin", companyId: "c1", roleChangedAt: at(1) }), "roleChanged");
});

test("only a login that can't get a token any more signs the website out", () => {
  for (const code of ["auth/user-disabled", "auth/user-token-expired", "auth/user-not-found", "auth/invalid-user-token"]) {
    assert.equal(isFatalRefreshError({ code }), true, code);
  }
  for (const err of [{ code: "auth/network-request-failed" }, { code: "auth/internal-error" }, new Error("x"), null, undefined]) {
    assert.equal(isFatalRefreshError(err), false);
  }
});
