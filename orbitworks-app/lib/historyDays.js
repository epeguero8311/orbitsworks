// Employee App History - turns a flat list of clock events (same shape as
// the real clockEvents: { id, type, timestamp }) into day cards, a day
// summary and an activity timeline. No React Native or Firebase imports so
// test/historyDays.test.js can run it under `node --test`.
// Builds on lib/employeeHome.js (day keys, worked time, clock times).

const { effectiveMs, dayKey, accumulateWorkedMs, formatClockTime } = require("./employeeHome");

const MIN_MS = 60000;

function sortByTime(events) {
  return events
    .filter((e) => e && effectiveMs(e) != null)
    .slice()
    .sort((a, b) => effectiveMs(a) - effectiveMs(b));
}

// Events -> [{ key: "YYYY-MM-DD", events (oldest first) }], newest day first.
function groupEventsByDay(events, timeZone) {
  const byKey = new Map();
  for (const event of sortByTime(events)) {
    const key = dayKey(effectiveMs(event), timeZone);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(event);
  }
  return [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, dayEvents]) => ({ key, events: dayEvents }));
}

// One day's events -> { shiftMs, workedMs, breakMs, open }.
// Shift: first clock in to last clock out (or nowMs while still open).
// Worked: shift minus breaks. Break: the rest.
function summarizeDay(events, nowMs) {
  const sorted = sortByTime(events);
  const firstIn = sorted.find((e) => e.type === "in");
  if (!firstIn) return { shiftMs: 0, workedMs: 0, breakMs: 0, open: false };
  const last = sorted[sorted.length - 1];
  const open = last.type !== "out";
  const end = open ? Math.max(nowMs ?? effectiveMs(last), effectiveMs(last)) : effectiveMs(last);
  const shiftMs = Math.max(0, end - effectiveMs(firstIn));
  const workedMs = Math.min(shiftMs, accumulateWorkedMs(sorted, end));
  return { shiftMs, workedMs, breakMs: shiftMs - workedMs, open };
}

function hoursMinutes(ms) {
  const total = Math.round(Math.max(0, ms) / MIN_MS);
  return { h: Math.floor(total / 60), m: total % 60 };
}

// Day card worked time: "7h 42m", "42m".
function formatWorked(ms) {
  const { h, m } = hoursMinutes(ms);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Break and detail durations: "30min", "7h 42min".
function formatDuration(ms) {
  const { h, m } = hoursMinutes(ms);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// Calendar labels from a "YYYY-MM-DD" key (the key is already the local
// day, so it's formatted at noon UTC to never shift a day).
function keyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function formatKey(key, options) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(keyDate(key));
}
function weekdayLabel(key) {
  return formatKey(key, { weekday: "long" });
}
// "Today" for today, otherwise the weekday ("Saturday").
function dayLabel(key, nowMs, timeZone) {
  return key === dayKey(nowMs, timeZone) ? "Today" : weekdayLabel(key);
}
// "Oct 4, 2025"
function shortDate(key) {
  return formatKey(key, { month: "short", day: "numeric", year: "numeric" });
}
// "October 3, 2025"
function longDate(key) {
  return formatKey(key, { month: "long", day: "numeric", year: "numeric" });
}

const EVENT_LABELS = {
  in: { label: "Clock in", tone: "green" },
  breakStart: { label: "Start break", tone: "orange" },
  breakEnd: { label: "End break", tone: "orange" },
  out: { label: "Clock out", tone: "red" },
};

// "7:30 am"
function formatEventTime(ms, timeZone) {
  return formatClockTime(ms, timeZone).replace(/ /g, " ").toLowerCase();
}

// One day's events -> [{ id, label, time, tone }] for the Activity timeline.
function timelineItems(events, timeZone) {
  return sortByTime(events)
    .filter((e) => EVENT_LABELS[e.type])
    .map((e, i) => ({
      id: e.id ?? `${e.type}-${i}`,
      ...EVENT_LABELS[e.type],
      time: formatEventTime(effectiveMs(e), timeZone),
    }));
}

module.exports = {
  groupEventsByDay,
  summarizeDay,
  formatWorked,
  formatDuration,
  dayLabel,
  weekdayLabel,
  shortDate,
  longDate,
  formatEventTime,
  timelineItems,
};
