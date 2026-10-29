// Employee App History helpers (lib/historyDays.js).
// Run: node --test test/historyDays.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("../lib/historyDays");

const TZ = "America/Chicago";
// Local Chicago wall time -> ms (October 2025 is CDT, UTC-5).
const at = (day, hh, mm) => Date.UTC(2025, 9, day, hh + 5, mm);
const ev = (id, type, ms) => ({ id, type, timestamp: ms });

const oct3 = [
  ev("1", "in", at(3, 7, 30)),
  ev("2", "breakStart", at(3, 12, 2)),
  ev("3", "breakEnd", at(3, 12, 32)),
  ev("4", "out", at(3, 15, 42)),
];

test("summary: shift, worked and break for one break", () => {
  const s = h.summarizeDay(oct3);
  assert.equal(h.formatDuration(s.shiftMs), "8h 12min");
  assert.equal(h.formatWorked(s.workedMs), "7h 42m");
  assert.equal(h.formatDuration(s.workedMs), "7h 42min");
  assert.equal(h.formatDuration(s.breakMs), "30min");
  assert.equal(s.open, false);
});

test("summary: two breaks add up", () => {
  const s = h.summarizeDay([
    ev("a", "in", at(2, 7, 0)),
    ev("b", "breakStart", at(2, 10, 0)),
    ev("c", "breakEnd", at(2, 10, 15)),
    ev("d", "breakStart", at(2, 12, 30)),
    ev("e", "breakEnd", at(2, 13, 0)),
    ev("f", "out", at(2, 15, 30)),
  ]);
  assert.equal(h.formatDuration(s.breakMs), "45min");
  assert.equal(h.formatWorked(s.workedMs), "7h 45m");
});

test("summary: a day with no breaks", () => {
  const s = h.summarizeDay([ev("a", "in", at(1, 8, 0)), ev("b", "out", at(1, 12, 15))]);
  assert.equal(h.formatDuration(s.breakMs), "0min");
  assert.equal(h.formatWorked(s.workedMs), "4h 15m");
});

test("summary: a shift still open runs to now", () => {
  const s = h.summarizeDay([ev("a", "in", at(4, 8, 0))], at(4, 9, 30));
  assert.equal(s.open, true);
  assert.equal(h.formatWorked(s.workedMs), "1h 30m");
});

test("summary: no clock in means zeros", () => {
  assert.deepEqual(h.summarizeDay([]), { shiftMs: 0, workedMs: 0, breakMs: 0, open: false });
});

test("events group by local day, newest day first", () => {
  const late = ev("x", "in", at(4, 22, 0)); // 03:00 UTC on Oct 5, still Oct 4 in Chicago
  const days = h.groupEventsByDay([...oct3, late], TZ);
  assert.deepEqual(days.map((d) => d.key), ["2025-10-04", "2025-10-03"]);
  assert.equal(days[1].events[0].type, "in");
});

test("day labels and dates", () => {
  assert.equal(h.dayLabel("2025-10-04", at(4, 9, 0), TZ), "Today");
  assert.equal(h.dayLabel("2025-10-03", at(4, 9, 0), TZ), "Friday");
  assert.equal(h.weekdayLabel("2025-10-04"), "Saturday");
  assert.equal(h.shortDate("2025-10-04"), "Oct 4, 2025");
  assert.equal(h.longDate("2025-10-03"), "October 3, 2025");
});

test("timeline: labels, tones and lowercase times in order", () => {
  const items = h.timelineItems(oct3.slice().reverse(), TZ);
  assert.deepEqual(
    items.map((i) => `${i.tone} ${i.label} ${i.time}`),
    ["green Clock in 7:30 am", "orange Start break 12:02 pm", "orange End break 12:32 pm", "red Clock out 3:42 pm"]
  );
});
