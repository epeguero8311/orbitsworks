// Time Tracking -> Clock events Filter button (lib/clockEventFilters.ts).
// Plain Node, no emulator. Run via: node --test test/clockEventFilters.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  filterClockEvents,
  activeFilterCount,
  EMPTY_CLOCK_EVENT_FILTERS as EMPTY,
  CLOCK_EVENTS_PAGE,
} from "../lib/clockEventFilters.ts";

const at = (h, m = 0) => ({ toMillis: () => new Date(2026, 10, 27, h, m).getTime() });
const ev = (id, extra) => ({ id, type: "in", source: "pin", siteId: "s1", timestamp: at(9), ...extra });
const ids = (list) => list.map((e) => e.id);

const EVENTS = [
  ev("a"),
  ev("b", { siteId: "s2", type: "out", source: "kiosk", timestamp: at(17, 30) }),
  ev("c", { type: "breakStart", timestamp: at(12) }),
  ev("d", { geofenceStatus: "outside", faceCheck: { status: "mismatch" }, timestamp: at(23) }),
  ev("e", { geofenceStatus: "inside", faceCheck: { status: "match" }, adjustedTimestamp: at(1) }),
  ev("f", { siteId: null, faceCheck: { status: "noFace" } }),
];

test("page size is 20", () => assert.equal(CLOCK_EVENTS_PAGE, 20));

test("no filters keeps everything", () => {
  assert.deepEqual(ids(filterClockEvents(EVENTS, EMPTY, true)), ["a", "b", "c", "d", "e", "f"]);
});

test("site, type and source", () => {
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, siteId: "s2" }, true)), ["b"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, type: "breakStart" }, true)), ["c"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, source: "kiosk" }, true)), ["b"]);
  // An adjusted row shows "Adjusted" as its source, so it matches only that.
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, source: "pin" }, true)), ["a", "c", "d", "f"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, source: "adjusted" }, true)), ["e"]);
});

test("time range uses the shown (adjusted) time, inclusive, and wraps overnight", () => {
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, timeFrom: "09:00", timeTo: "12:00" }, true)), ["a", "c", "f"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, timeFrom: "17:00" }, true)), ["b", "d"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, timeTo: "02:00" }, true)), ["e"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, timeFrom: "22:00", timeTo: "02:00" }, true)), ["d", "e"]);
});

test("geofence and face check (Pro); breaks never match them", () => {
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, geofence: "outside" }, true)), ["d"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, geofence: "inside" }, true)), ["e"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, face: "match" }, true)), ["e"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, face: "mismatch" }, true)), ["d"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, face: "noFace" }, true)), ["f"]);
  assert.deepEqual(ids(filterClockEvents(EVENTS, { ...EMPTY, face: "notChecked" }, true)), ["a", "b"]);
});

test("Core: geofence / face filters are ignored and not counted", () => {
  const f = { ...EMPTY, geofence: "outside", face: "match", siteId: "s1" };
  assert.deepEqual(ids(filterClockEvents(EVENTS, f, false)), ["a", "c", "d", "e"]);
  assert.equal(activeFilterCount(f, false), 1);
  assert.equal(activeFilterCount(f, true), 3);
  assert.equal(activeFilterCount({ ...EMPTY, timeFrom: "01:00", timeTo: "02:00" }, true), 1);
});
