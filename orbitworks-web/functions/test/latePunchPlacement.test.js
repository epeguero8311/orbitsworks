// B (2026-11-21) - where a late queued punch goes and what it replaces
// (latePunchPlacement.ts). Pure logic, no emulator.
// Run: npm run build && node --test test/latePunchPlacement.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { placeLatePunch, newestAfterPlacement } = require("../lib/latePunchPlacement.js");

const H = 3600000;
const SAT = Date.UTC(2026, 10, 21, 0, 0); // midnight
const at = (h, m = 0) => SAT + h * H + m * 60000;
let n = 0;
const ev = (type, ms, source = "employeeApp") => ({ id: `${source}-${type}-${++n}`, type, source, ms });
const real = (type, ms) => ev(type, ms, "pin");
const auto = (type, ms) => ev(type, ms, "autoClockOut");
const hand = (type, ms) => ev(type, ms, "adminManual");
const ids = (p) => p.remove.map((e) => e.id).sort();

function split(events, ms) {
  return { before: events.filter((e) => e.ms <= ms), after: events.filter((e) => e.ms > ms) };
}
const place = (action, ms, events) => placeLatePunch({ action, eventMs: ms, ...split(events, ms) });

test("case 1/4: weekend punches between real ones - nothing removed, no conflict", () => {
  const friOut = real("out", at(-7));
  const monIn = real("in", at(55));
  const p1 = place("in", at(8), [friOut, monIn]);
  assert.deepEqual(p1, { remove: [], conflict: false });
  const satIn = ev("in", at(8));
  const p2 = place("out", at(16), [friOut, satIn, monIn]);
  assert.deepEqual(p2, { remove: [], conflict: false });
});

test("case 5: real clock-out EARLIER than the auto clock-out replaces it (and its auto break end)", () => {
  const inE = real("in", at(8));
  const brk = real("breakStart", at(19));
  const autoBreakEnd = auto("breakEnd", at(20));
  const autoOut = auto("out", at(20));
  const p = place("out", at(16), [inE, autoBreakEnd, autoOut]);
  assert.deepEqual(ids(p), [autoBreakEnd.id, autoOut.id].sort());
  assert.equal(p.conflict, false);
  // with an open break at the cap: the auto break end goes too
  const p2 = place("breakEnd", at(19, 30), [inE, brk, autoBreakEnd, autoOut]);
  assert.deepEqual(ids(p2), [autoBreakEnd.id, autoOut.id].sort());
});

test("case 5: real clock-out LATER than the auto clock-out replaces it", () => {
  const inE = real("in", at(8));
  const autoOut = auto("out", at(20));
  const p = place("out", at(21), [inE, autoOut]);
  assert.deepEqual(ids(p), [autoOut.id]);
  assert.equal(p.conflict, false);
});

test("case 5: a queued break inside the auto-closed shift also removes the auto clock-out", () => {
  const inE = real("in", at(8));
  const autoOut = auto("out", at(20));
  const p = place("breakStart", at(12), [inE, autoOut]);
  assert.deepEqual(ids(p), [autoOut.id]);
});

test("case 5: an auto clock-out of an EARLIER shift is never touched by a new clock-in", () => {
  const friIn = real("in", at(-16));
  const friAuto = auto("out", at(-4));
  const p = place("in", at(8), [friIn, friAuto]);
  assert.deepEqual(p, { remove: [], conflict: false });
});

test("case 6: a hand-entered shift is replaced by the real punches, with its breaks", () => {
  const hIn = hand("in", at(8));
  const hBs = hand("breakStart", at(12));
  const hBe = hand("breakEnd", at(12, 30));
  const hOut = hand("out", at(16));
  // phone clock-in a little after the admin's
  const p1 = place("in", at(8, 2), [hIn, hBs, hBe, hOut]);
  assert.deepEqual(ids(p1), [hIn.id, hBs.id, hBe.id].sort());
  assert.equal(p1.conflict, false);
  // then its clock-out a little after the admin's
  const phoneIn = ev("in", at(8, 2));
  const p2 = place("out", at(16, 1), [phoneIn, hOut]);
  assert.deepEqual(ids(p2), [hOut.id]);
  assert.equal(p2.conflict, false);
});

test("case 6: phone clock-in a little BEFORE the admin's replaces it too", () => {
  const friOut = real("out", at(-7));
  const hIn = hand("in", at(8));
  const hOut = hand("out", at(16));
  const p = place("in", at(7, 58), [friOut, hIn, hOut]);
  assert.deepEqual(ids(p), [hIn.id]);
  assert.equal(p.conflict, false);
});

test("case 6: a hand-entered event more than 12 h away is never replaced", () => {
  const hIn = hand("in", at(-20)); // yesterday, never closed
  const p = place("in", at(8), [hIn]);
  assert.deepEqual(ids(p), []);
  assert.equal(p.conflict, true);
});

test("case 6: a hand-entered clock-out added for a real shift is replaced by the phone's real one", () => {
  const phoneIn = ev("in", at(8));
  const hOut = hand("out", at(17));
  const p = place("out", at(16), [phoneIn, hOut]);
  assert.deepEqual(ids(p), [hOut.id]);
  assert.equal(p.conflict, false);
});

test("case 7: two real clock-ins - both kept, conflict flagged", () => {
  const kioskIn = real("in", at(8));
  const p = place("in", at(8, 2), [kioskIn]);
  assert.deepEqual(p, { remove: [], conflict: true });
});

test("a clock-out with nothing before it is a conflict, recorded anyway", () => {
  assert.deepEqual(place("out", at(16), []), { remove: [], conflict: true });
  assert.deepEqual(place("in", at(8), []), { remove: [], conflict: false });
});

test("newestAfterPlacement: the status comes from what is left", () => {
  const inE = real("in", at(8));
  const autoOut = auto("out", at(20));
  const punch = ev("out", at(16));
  assert.equal(newestAfterPlacement([autoOut, inE], punch, [autoOut]).id, punch.id);
  const monIn = real("in", at(55));
  assert.equal(newestAfterPlacement([monIn, inE], punch, []).id, monIn.id);
});
