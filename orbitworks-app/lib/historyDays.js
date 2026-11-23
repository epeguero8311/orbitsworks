// Employee App History - turns the employee's clock events (same shape as
// the real clockEvents: { id, type, timestamp }) into this week's day cards
// and each day's activity timeline (buildWeekHistory). No React Native or
// Firebase imports so test/historyDays.test.js and historyWeek.test.js run
// it under `node --test`. Builds on lib/employeeHome.js (day keys, the
// shared shift walk, clock times).

const { effectiveMs, dayKey, weekKey, formatClockTime, walkShifts } = require("./employeeHome");

const MIN_MS = 60000;

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
  return formatClockTime(ms, timeZone).replace(/\u202f/g, " ").toLowerCase();
}

// ---- Phase 5: this week from real clock events ----

// Sync tags on a punch (decided 2026-11-03):
//   willSync   - still on the phone: Waiting or Syncing
//   notSynced  - failed on the phone (always for good - no Redo; it can
//                only be removed)
//   syncedLate - the server's syncedLate flag (arrived 5+ min late)
// Tones are StatusPill tones: Will sync blue, Synced late gray (neutral),
// Not synced red; In progress green, Missing clock-out orange.
const TAG_LABELS = { willSync: "Will sync", syncedLate: "Synced late", notSynced: "Not synced" };
const TAG_TONES = { willSync: "blue", syncedLate: "neutral", notSynced: "red" };

function punchTag(event) {
  if (event.queued && event.localStatus) {
    if (event.localStatus === "waiting" || event.localStatus === "syncing") return "willSync";
    if (event.localStatus === "failed") return "notSynced";
    return null;
  }
  return event.syncedLate === true ? "syncedLate" : null;
}

function punchItem(event, timeZone) {
  return {
    id: event.id,
    type: event.type,
    ...EVENT_LABELS[event.type],
    time: formatEventTime(effectiveMs(event), timeZone),
    tag: punchTag(event),
  };
}

// "YYYY-MM-DD" keys from this week's Monday to today (company time).
function weekDayKeys(nowMs, timeZone) {
  const [y, m, d] = weekKey(nowMs, timeZone).split("-").map(Number);
  const todayKey = dayKey(nowMs, timeZone);
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const key = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    keys.push(key);
    if (key === todayKey) break;
  }
  return keys;
}

// The History tab: this week, Monday to today in the company's time zone,
// newest day first. Every day is listed (a day off has 0 and no items).
// events = the employee's clock events with the phone's queued punches
// folded in (foldQueuedEvents). Hours use the same rule as Home's
// computeHours (walkShifts): closed shifts only, auto break on, each shift
// on its clock-in day - so a shift across midnight shows all its punches on
// the day it started. The newest shift, if still open, is the current
// shift: "In progress". Any other open shift has a missing clock-out.
// Punches whose clock-in isn't in the list show on their own day, no hours.
//   -> { days: [{ key, label, dateLabel, workedMs, breakMs, shiftMs,
//        hasActivity, inProgress, missingClockOut, willSync, syncedLate,
//        notSynced, items: [{ id, type, label, tone, time, tag }] }] }
function buildWeekHistory(events, nowMs, timeZone, breaks) {
  const { shifts, orphans } = walkShifts(events.filter((e) => EVENT_LABELS[e.type]), breaks);
  const last = shifts[shifts.length - 1];
  const current = last && !last.closed ? last : null;

  const days = weekDayKeys(nowMs, timeZone).map((key) => ({
    key,
    label: dayLabel(key, nowMs, timeZone),
    dateLabel: shortDate(key),
    workedMs: 0,
    breakMs: 0,
    shiftMs: 0,
    hasActivity: false,
    inProgress: false,
    missingClockOut: false,
    willSync: false,
    syncedLate: false,
    notSynced: false,
    items: [],
    sortMs: [],
  }));
  const byKey = new Map(days.map((d) => [d.key, d]));

  const add = (day, item, ms) => {
    day.items.push(item);
    day.sortMs.push(ms);
    day.hasActivity = true;
    if (item.tag) day[item.tag] = true;
  };

  for (const shift of shifts) {
    const day = byKey.get(dayKey(shift.inMs, timeZone));
    if (!day) continue;
    for (const event of shift.events) add(day, punchItem(event, timeZone), effectiveMs(event));
    const endMs = effectiveMs(shift.events[shift.events.length - 1]);
    if (shift.closed) {
      day.workedMs += shift.netMs;
      day.breakMs += shift.breakMs;
      day.shiftMs += shift.shiftMs;
    } else if (shift === current) {
      day.inProgress = true;
      add(day, { id: `${shift.inEvent.id}-progress`, type: "inProgress", label: "In progress", tone: "green", time: "", tag: null }, endMs);
    } else {
      day.missingClockOut = true;
      add(day, { id: `${shift.inEvent.id}-missing`, type: "missingOut", label: "Missing clock-out", tone: "orange", time: "", tag: null }, endMs);
    }
  }
  for (const event of orphans) {
    const day = byKey.get(dayKey(effectiveMs(event), timeZone));
    if (day) add(day, punchItem(event, timeZone), effectiveMs(event));
  }

  // Shifts and orphans can interleave on a day: put each day in time order
  // (the In progress / Missing clock-out row stays right after its shift's
  // last punch - a stable sort keeps it there).
  for (const day of days) {
    const order = day.items.map((item, i) => ({ item, ms: day.sortMs[i], i }));
    order.sort((a, b) => a.ms - b.ms || a.i - b.i);
    day.items = order.map((o) => o.item);
    delete day.sortMs;
  }
  return { days: days.reverse() };
}

// ---- Phase 5 Layer 7a: what the History screens show ----

// Day card pills, most urgent first. day = one of buildWeekHistory's days.
const DAY_BADGES = [
  ["missingClockOut", "Missing clock-out", "orange"],
  ["inProgress", "In progress", "green"],
  ["notSynced", TAG_LABELS.notSynced, TAG_TONES.notSynced],
  ["willSync", TAG_LABELS.willSync, TAG_TONES.willSync],
  ["syncedLate", TAG_LABELS.syncedLate, TAG_TONES.syncedLate],
];

function dayBadges(day) {
  if (!day) return [];
  return DAY_BADGES.filter(([flag]) => day[flag]).map(([, label, tone]) => ({ label, tone }));
}

// The day screen's Activity timeline: every punch and break, each with its
// sync tag as a pill ({ label, tone } or null), then In progress / Missing
// clock-out (no pill - the row itself says it; warn = shown in orange).
function timelineRows(day) {
  if (!day || !Array.isArray(day.items)) return [];
  return day.items.map((item) => ({
    id: String(item.id),
    label: item.label,
    time: item.time,
    tone: item.tone,
    tag: item.tag ? { label: TAG_LABELS[item.tag], tone: TAG_TONES[item.tag] } : null,
    warn: item.type === "missingOut",
  }));
}

// The My Hours list: only days the employee worked (decided 2026-11-06 -
// a day off has no row). A day with an open shift has 0 counted hours
// until the clock-out (closed shifts only, same as Home), so it stays
// listed while it's In progress or has a Missing clock-out; so does a day
// with a punch that failed to sync. Never changes the hours themselves.
// days = buildWeekHistory's days, order kept.
function workedDays(days) {
  if (!Array.isArray(days)) return [];
  return days.filter((d) => d.workedMs > 0 || d.inProgress || d.missingClockOut || d.notSynced);
}

// One day of this week by its "YYYY-MM-DD" key, or null (e.g. a day from
// an older week left open on the screen).
function findDay(days, key) {
  if (!Array.isArray(days) || !key) return null;
  return days.find((d) => d.key === key) || null;
}

module.exports = {
  TAG_LABELS,
  TAG_TONES,
  punchTag,
  buildWeekHistory,
  dayBadges,
  timelineRows,
  findDay,
  workedDays,
  formatWorked,
  formatDuration,
  dayLabel,
  weekdayLabel,
  shortDate,
  longDate,
  formatEventTime,
};
