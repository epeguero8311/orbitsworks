// Unit tests for lib/employeeInvites/status.ts (Phase 3B Employees page).
// Plain Node, no emulator. Run via: node --test test/employeeInviteStatus.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { employeeInviteLink, inviteDisplayStatus, isLiveInvite, latestInviteByEmployee } from "../lib/employeeInvites/status.ts";

const NOW = 1_000_000;
const ts = (ms) => ({ toMillis: () => ms });
const inv = (o) => ({ id: "t", status: "pending", expiresAt: ts(NOW + 1000), createdAt: ts(NOW - 1000), employeeId: null, ...o });

test("display status: expired is derived from pending + past expiry", () => {
  assert.equal(inviteDisplayStatus(inv({}), NOW), "pending");
  assert.equal(inviteDisplayStatus(inv({ expiresAt: ts(NOW) }), NOW), "expired");
  assert.equal(inviteDisplayStatus(inv({ status: "accepted", expiresAt: ts(1) }), NOW), "accepted");
  assert.equal(inviteDisplayStatus(inv({ status: "revoked", expiresAt: ts(1) }), NOW), "revoked");
  // A doc mid-write (no expiresAt yet) is not shown as expired.
  assert.equal(inviteDisplayStatus(inv({ expiresAt: null }), NOW), "pending");
  assert.equal(isLiveInvite(inv({}), NOW), true);
  assert.equal(isLiveInvite(inv({ expiresAt: ts(NOW - 1) }), NOW), false);
});

test("link: base + /i/ + token, trailing slash and odd chars handled", () => {
  assert.equal(employeeInviteLink("abc_-123", "https://x.hosted.app/"), "https://x.hosted.app/i/abc_-123");
  assert.equal(employeeInviteLink("abc", "https://orbitsworks.com"), "https://orbitsworks.com/i/abc");
  assert.equal(employeeInviteLink("a/b", "https://x"), "https://x/i/a%2Fb");
});

test("row pill: live invite wins over newer dead ones; else newest; no-row invites skipped", () => {
  const live = inv({ id: "live", employeeId: "e1", createdAt: ts(10) });
  const newerRevoked = inv({ id: "rev", employeeId: "e1", status: "revoked", createdAt: ts(20) });
  const old = inv({ id: "old", employeeId: "e2", status: "revoked", createdAt: ts(5) });
  const newer = inv({ id: "new", employeeId: "e2", expiresAt: ts(NOW - 1), createdAt: ts(30) });
  const noRow = inv({ id: "np", employeeId: null });
  const m = latestInviteByEmployee([newerRevoked, live, old, newer, noRow], NOW);
  assert.equal(m.get("e1").id, "live");
  assert.equal(m.get("e2").id, "new");
  assert.equal(m.size, 2);
});
