// Phase 9 - the website's pure helpers: invite role gating (H2/H3), synced
// late punches (H6), job site exit totals / tags / Overview (H7/H8), the
// Reports company filter (H9). Plain Node, no emulator.
// Run via: node --test test/phase9Lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { inviteRoleBlock, seatsText, NO_SEATS_TEXT, PAST_DUE_TEXT, APP_INVITES_PLAN_TEXT } from "../lib/inviteRoles.ts";
import { syncedLatePunches, lateLabel } from "../lib/syncedLate.ts";
import { exitMinutes, summarizeSiteExits, siteExitTag, outsideNow, todayByPerson, MAX_PER_PERSON } from "../lib/siteExits.ts";
import { companyMatches, ALL_COMPANIES, MAIN_COMPANY } from "../lib/reportCompanyFilter.ts";

const MIN = 60000;
const ok = { canUseAppInvites: true, pastDue: false, seatsLeft: 3 };

test("invite roles: past due blocks all; app invites need Core/Pro; no seats blocks employee + supervisor only", () => {
  for (const r of ["employee", "supervisor", "admin"]) assert.equal(inviteRoleBlock(r, ok), null);
  for (const r of ["employee", "supervisor", "admin"]) assert.equal(inviteRoleBlock(r, { ...ok, pastDue: true }), PAST_DUE_TEXT);
  assert.equal(inviteRoleBlock("employee", { ...ok, canUseAppInvites: false }), APP_INVITES_PLAN_TEXT);
  assert.equal(inviteRoleBlock("supervisor", { ...ok, canUseAppInvites: false }), null);
  assert.equal(inviteRoleBlock("employee", { ...ok, seatsLeft: 0 }), NO_SEATS_TEXT);
  assert.equal(inviteRoleBlock("supervisor", { ...ok, seatsLeft: 0 }), NO_SEATS_TEXT);
  assert.equal(inviteRoleBlock("admin", { ...ok, seatsLeft: 0 }), null);
  assert.equal(inviteRoleBlock("employee", { ...ok, seatsLeft: null }), null);
  assert.equal(seatsText(3, 10), "3 of 10 seats left");
  assert.equal(seatsText(null, null), "");
});

test("synced late: only flagged punches, lateness from createdAt", () => {
  const ts = (ms) => ({ toMillis: () => ms });
  const list = syncedLatePunches([
    { id: "a", type: "in", syncedLate: true, timestamp: ts(0), createdAt: ts(12 * MIN) },
    { id: "b", type: "out", syncedLate: false, timestamp: ts(0), createdAt: ts(99 * MIN) },
    { id: "c", type: "breakStart", syncedLate: true, timestamp: ts(0) },
  ]);
  assert.deepEqual(list, [{ id: "a", type: "in", lateMs: 12 * MIN }, { id: "c", type: "breakStart", lateMs: null }]);
  assert.equal(lateLabel(12 * MIN), "12 min late");
  assert.equal(lateLabel(185 * MIN), "3 h 5 min late");
  assert.equal(lateLabel(120 * MIN), "2 h late");
  assert.equal(lateLabel(null), "late");
});

const ex = (o = {}) => ({ kind: "left", startMs: 0, endMs: 20 * MIN, endReason: "returned", onBreak: false, offReason: null, employeeId: "e1", employeeName: "Ana", ...o });

test("exit totals: red vs gray (break, short) vs tracking off; open ones count to the given end", () => {
  assert.equal(exitMinutes(ex(), 0), 20);
  assert.equal(exitMinutes(ex({ endMs: null, endReason: null }), 45 * MIN), 45);
  const s = summarizeSiteExits(
    [ex(), ex({ onBreak: true }), ex({ endMs: 2 * MIN }), ex({ kind: "trackingOff", endReason: "trackingOn", endMs: 10 * MIN }), ex({ endMs: null, endReason: null })],
    30 * MIN
  );
  assert.deepEqual(s, { redCount: 2, redMinutes: 50, grayCount: 3, grayMinutes: 22, trackingOffMinutes: 10 });
  assert.deepEqual(summarizeSiteExits([], 0), { redCount: 0, redMinutes: 0, grayCount: 0, grayMinutes: 0, trackingOffMinutes: 0 });
});

test("exit tags", () => {
  assert.equal(siteExitTag(ex()), "Left the job site");
  assert.equal(siteExitTag(ex({ onBreak: true })), "Left - on break");
  assert.equal(siteExitTag(ex({ endMs: MIN })), "Left - short");
  assert.equal(siteExitTag(ex({ kind: "trackingOff", offReason: "signedOut" })), "Tracking off (signed out of the app)");
  assert.equal(siteExitTag(ex({ kind: "trackingOff", offReason: null })), "Tracking off");
});

test("Overview: outside now = open red ones; today grouped per person with +N more", () => {
  const list = [
    ex({ startMs: 5, endMs: null, endReason: null }),
    ex({ startMs: 9, endMs: null, endReason: null, onBreak: true }),
    ex({ startMs: 7, endMs: null, endReason: null, kind: "trackingOff" }),
    ex({ startMs: 3 }),
  ];
  assert.deepEqual(outsideNow(list).map((e) => e.startMs), [5]);
  const many = Array.from({ length: MAX_PER_PERSON + 2 }, (_, i) => ex({ startMs: i }));
  const people = todayByPerson([...many, ex({ startMs: 100, employeeId: "e2", employeeName: "Ben" })]);
  assert.equal(people[0].employeeName, "Ben");
  assert.equal(people[1].shown.length, MAX_PER_PERSON);
  assert.equal(people[1].more, 2);
  assert.equal(people[1].shown[0].startMs, MAX_PER_PERSON + 1);
});

test("company filter: all, in-house, one subcontractor", () => {
  assert.equal(companyMatches(ALL_COMPANIES, "sub1"), true);
  assert.equal(companyMatches(ALL_COMPANIES, null), true);
  assert.equal(companyMatches(MAIN_COMPANY, null), true);
  assert.equal(companyMatches(MAIN_COMPANY, "sub1"), false);
  assert.equal(companyMatches("sub1", "sub1"), true);
  assert.equal(companyMatches("sub1", "sub2"), false);
  assert.equal(companyMatches("sub1", undefined), false);
});
