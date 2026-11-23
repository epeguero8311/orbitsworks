// Supervisor app Phase 10 (A3, D6 a) - lib/activeSiteFilter.js: the site
// filter shows who is clocked in AT that site now (their open shift's
// clock-in site), not who is assigned to it.
// Run: node --test test/activeSiteFilter.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const f = require("../lib/activeSiteFilter");

const H = 60 * 60 * 1000;
const T0 = Date.parse("2026-11-05T14:00:00Z");
const ts = (ms) => ({ toMillis: () => ms });
const ev = (employeeId, type, ms, siteId) => ({ employeeId, type, timestamp: ts(ms), siteId });
const SITE_A = { id: "A", name: "Site A" };
const SITE_B = { id: "B", name: "Site B" };
const NO_SITE = { id: "none", name: "No Site" };

test("open shift site: the newest clock-in in the window; a break keeps it", () => {
  const events = [ev("e1", "in", T0, "A"), ev("e1", "breakStart", T0 + H, null)];
  assert.equal(f.openShiftSiteId({ id: "e1", status: "break", lastEventSiteId: "B" }, events), "A");
  assert.equal(f.openShiftSiteId({ id: "e1", status: "in" }, [ev("e1", "in", T0, "A"), ev("e2", "in", T0 + H, "B")]), "A", "someone else's clock-in is ignored");
});

test("open shift site: a clock-out after the last clock-in, or no clock-in in the window -> the employee doc's last site", () => {
  const events = [ev("e1", "in", T0, "A"), ev("e1", "out", T0 + H, "A")];
  assert.equal(f.openShiftSiteId({ id: "e1", status: "in", lastEventSiteId: "B" }, events), "B");
  assert.equal(f.openShiftSiteId({ id: "e1", status: "in", lastEventSiteId: "B" }, []), "B", "shift began before the window");
  assert.equal(f.openShiftSiteId({ id: "e1", status: "in" }, undefined), null);
  assert.equal(f.openShiftSiteId({ id: "e1", status: "in" }, [ev("e1", "in", T0, null)]), null, "clocked in with no site");
});

test("open shift site: not clocked in = null", () => {
  assert.equal(f.openShiftSiteId({ id: "e1", status: "out", lastEventSiteId: "A" }, [ev("e1", "in", T0, "A")]), null);
  assert.equal(f.openShiftSiteId(null, []), null);
});

test("activeAtSite: clocked in AT the site, not assigned to it (A3)", () => {
  const people = [
    { id: "ana", status: "in", shiftSiteId: "A", assignedSiteIds: ["B"] },
    { id: "ben", status: "in", shiftSiteId: "B", assignedSiteIds: ["A"] },
    { id: "cy", status: "break", shiftSiteId: "A", assignedSiteIds: [] },
    { id: "dee", status: "out", shiftSiteId: null, assignedSiteIds: ["A"] },
    { id: "eve", status: "in", shiftSiteId: null, assignedSiteIds: ["A"] },
  ];
  assert.deepEqual(f.activeAtSite(people, SITE_A).map((e) => e.id), ["ana", "cy"]);
  assert.deepEqual(f.activeAtSite(people, SITE_B).map((e) => e.id), ["ben"]);
  assert.deepEqual(f.activeAtSite(people, NO_SITE).map((e) => e.id), ["eve"], "No Site = clocked in with no site");
  assert.deepEqual(f.activeAtSite(people, null).map((e) => e.id), ["ana", "ben", "cy", "eve"], "All Sites = everyone clocked in");
  assert.deepEqual(f.activeAtSite(undefined, SITE_A), []);
});

test("assignedToSite: the old rule, for people not clocked in yet", () => {
  const people = [
    { id: "ana", assignedSiteIds: ["A"] },
    { id: "ben", assignedSiteIds: ["B"] },
    { id: "cy", assignedSiteIds: [] },
    { id: "dee" },
  ];
  assert.deepEqual(f.assignedToSite(people, SITE_A).map((e) => e.id), ["ana"]);
  assert.deepEqual(f.assignedToSite(people, NO_SITE).map((e) => e.id), ["cy", "dee"]);
  assert.equal(f.assignedToSite(people, null).length, 4);
});

test("a clock-in saved on this phone (not synced yet) counts at its own site", () => {
  const emp = { id: "ana", status: "out", shiftSiteId: null };
  assert.deepEqual(f.withQueuedShift(emp, { status: "in", inSiteId: "B" }), { id: "ana", status: "in", shiftSiteId: "B" });
  const onShift = { id: "ana", status: "in", shiftSiteId: "A" };
  assert.deepEqual(f.withQueuedShift(onShift, { status: "break", inSiteId: undefined }), { id: "ana", status: "break", shiftSiteId: "A" }, "a queued break keeps the shift site");
  assert.deepEqual(f.withQueuedShift(onShift, { status: "out", inSiteId: "A" }), { id: "ana", status: "out", shiftSiteId: null }, "a queued clock-out ends it");
  assert.equal(f.withQueuedShift(onShift, undefined), onShift);
  assert.equal(f.activeAtSite([f.withQueuedShift(emp, { status: "in", inSiteId: "B" })], SITE_B).length, 1);
});
