// Employee App History helpers (lib/historyDays.js): time formats and day
// labels. The week, hours and tags are in test/historyWeek.test.js.
// Run: node --test test/historyDays.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("../lib/historyDays");

const TZ = "America/Chicago";
// Local Chicago wall time -> ms (October 2025 is CDT, UTC-5).
const at = (day, hh, mm) => Date.UTC(2025, 9, day, hh + 5, mm);
const MIN = 60000;
const HOUR = 60 * MIN;

test("formats: day card worked time and durations", () => {
  assert.equal(h.formatDuration(8 * HOUR + 12 * MIN), "8h 12min");
  assert.equal(h.formatWorked(7 * HOUR + 42 * MIN), "7h 42m");
  assert.equal(h.formatDuration(7 * HOUR + 42 * MIN), "7h 42min");
  assert.equal(h.formatDuration(30 * MIN), "30min");
  assert.equal(h.formatDuration(0), "0min");
  assert.equal(h.formatWorked(42 * MIN), "42m");
  assert.equal(h.formatWorked(4 * HOUR + 15 * MIN), "4h 15m");
  assert.equal(h.formatWorked(29 * 1000), "0m", "rounds to the minute");
  assert.equal(h.formatWorked(-5 * MIN), "0m", "never negative");
});

test("day labels and dates", () => {
  assert.equal(h.dayLabel("2025-10-04", at(4, 9, 0), TZ), "Today");
  assert.equal(h.dayLabel("2025-10-03", at(4, 9, 0), TZ), "Friday");
  assert.equal(h.weekdayLabel("2025-10-04"), "Saturday");
  assert.equal(h.shortDate("2025-10-04"), "Oct 4, 2025");
  assert.equal(h.longDate("2025-10-03"), "October 3, 2025");
});

test("event time: lowercase, company time zone", () => {
  assert.equal(h.formatEventTime(at(3, 7, 30), TZ), "7:30 am");
  assert.equal(h.formatEventTime(at(3, 15, 42), TZ), "3:42 pm");
});

test("the mock-era helpers are gone (History uses buildWeekHistory)", () => {
  for (const name of ["groupEventsByDay", "summarizeDay", "timelineItems"]) assert.equal(h[name], undefined, name);
});
