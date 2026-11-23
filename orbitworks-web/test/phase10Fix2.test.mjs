// Phase 10 fix round 2 - the "clocked out at another site" note (B b).
// Plain Node, no emulator.
// Run via: node --test test/phase10Fix2.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { clockOutSiteNote, sessionSiteNote } from "../lib/clockOutSite.ts";

const IN_A = { type: "in", siteId: "a", siteName: "Site A" };
const OUT_A = { type: "out", siteId: "a", siteName: "Site A" };
const OUT_B = { type: "out", siteId: "b", siteName: "Site B" };
const OUT_NONE = { type: "out", siteId: null, siteName: "Not specified" };
const IN_NONE = { type: "in", siteId: null, siteName: "" };

test("approvals note: only when the clock-out site differs", () => {
  assert.equal(clockOutSiteNote(IN_A, OUT_B), "Clocked out at Site B");
  assert.equal(clockOutSiteNote(IN_A, OUT_A), null);
  assert.equal(clockOutSiteNote(IN_A, OUT_NONE), "Clocked out at Not specified");
  assert.equal(clockOutSiteNote(IN_NONE, OUT_B), "Clocked out at Site B");
  assert.equal(clockOutSiteNote(IN_NONE, { type: "out", siteId: "", siteName: "" }), null, "both without a site");
  assert.equal(clockOutSiteNote(IN_A, null), null, "still clocked in");
  assert.equal(clockOutSiteNote(IN_A, { type: "breakStart", siteId: "b" }), null, "not a clock-out");
  assert.equal(clockOutSiteNote(IN_A, { type: "out", siteId: "b", siteName: "" }), "Clocked out at Not specified", "a site with no name");
});

test("event detail note: the clock-in says where it ended, the clock-out where it started", () => {
  assert.equal(sessionSiteNote(IN_A, IN_A, OUT_B), "Clocked out at Site B");
  assert.equal(sessionSiteNote(OUT_B, IN_A, OUT_B), "Clocked in at Site A - the shift's hours count there");
  assert.equal(sessionSiteNote({ type: "breakStart", siteId: "a" }, IN_A, OUT_B), null);
  assert.equal(sessionSiteNote(OUT_A, IN_A, OUT_A), null);
  assert.equal(sessionSiteNote(null, IN_A, OUT_B), null);
});
