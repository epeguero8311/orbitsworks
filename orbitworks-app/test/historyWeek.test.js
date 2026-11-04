// Employee App Phase 5 - History tab data (lib/historyDays.js
// buildWeekHistory, lib/employeeHome.js walkShifts): this week day by day,
// same hours rule as Home's computeHours, every punch with its sync tag,
// missing clock-out and the shift in progress.
// Run: node --test test/historyWeek.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const hist = require("../lib/historyDays");
const home = require("../lib/employeeHome");
const q = require("../lib/punchQueueLogic");

const TZ = "America/Chicago";
// Chicago wall time -> ms. November 2026 is CST (UTC-6).
const t = (s) => Date.parse(`${s}:00-06:00`);
// Wednesday Nov 4, 2026, 3 PM. The week is Mon Nov 2 - Wed Nov 4.
const NOW = t("2026-11-04T15:00");
const MIN = 60000;
const HOUR = 60 * MIN;
const NO_AUTO = { automaticBreakMinutes: 0, minimumShiftHours: 0 };
const AUTO = { automaticBreakMinutes: 30, minimumShiftHours: 6 };

let seq = 0;
const ev = (type, local, extra) => {
  seq += 1;
  return { id: `e${seq}`, type, timestamp: t(local), ...extra };
};
const dayOf = (week, key) => week.days.find((d) => d.key === key);

// ---- the week ----

test("week: Monday to today, newest first, every day listed; days off show 0 and no activity", () => {
  const week = hist.buildWeekHistory([], NOW, TZ, NO_AUTO);
  assert.deepEqual(
    week.days.map((d) => [d.key, d.label, d.dateLabel]),
    [
      ["2026-11-04", "Today", "Nov 4, 2026"],
      ["2026-11-03", "Tuesday", "Nov 3, 2026"],
      ["2026-11-02", "Monday", "Nov 2, 2026"],
    ]
  );
  for (const d of week.days) {
    assert.equal(d.workedMs, 0);
    assert.equal(d.hasActivity, false);
    assert.deepEqual(d.items, []);
  }
  assert.equal(hist.formatWorked(0), "0m");
});

test("week: on Monday only Monday shows", () => {
  const week = hist.buildWeekHistory([], t("2026-11-02T00:30"), TZ, NO_AUTO);
  assert.deepEqual(
    week.days.map((d) => d.key),
    ["2026-11-02"]
  );
});

test("week: last week's and last Sunday's shifts are left out", () => {
  const events = [ev("in", "2026-10-31T08:00"), ev("out", "2026-10-31T16:00"), ev("in", "2026-11-01T22:00"), ev("out", "2026-11-02T06:00")];
  const week = hist.buildWeekHistory(events, NOW, TZ, NO_AUTO);
  assert.equal(week.days.every((d) => d.items.length === 0 && d.workedMs === 0), true);
});

// ---- hours: same rule as Home ----

test("hours: each day's worked time is Home's computeHours rule (auto break on, closed shifts, clock-in day)", () => {
  const events = [
    // Mon: 8h with a 30 min break -> auto break adds 30 min
    ev("in", "2026-11-02T07:00"),
    ev("breakStart", "2026-11-02T11:00"),
    ev("breakEnd", "2026-11-02T11:30"),
    ev("out", "2026-11-02T15:00"),
    // Tue: 4h, shorter than 6h -> no auto break
    ev("in", "2026-11-03T08:00"),
    ev("out", "2026-11-03T12:00"),
    // Tue night across midnight -> counts on Tuesday
    ev("in", "2026-11-03T22:00"),
    ev("out", "2026-11-04T05:00"),
    // Wed: closed 2h shift, then clocked in again (open)
    ev("in", "2026-11-04T08:00"),
    ev("out", "2026-11-04T10:00"),
    ev("in", "2026-11-04T13:00"),
  ];
  const week = hist.buildWeekHistory(events, NOW, TZ, AUTO);
  const hours = home.computeHours(events, NOW, TZ, AUTO);
  const sum = week.days.reduce((s, d) => s + d.workedMs, 0);
  assert.equal(sum, hours.weekMs, "week total = Home's week hours");
  assert.equal(dayOf(week, "2026-11-04").workedMs, hours.todayMs, "today = Home's today hours");
  assert.equal(dayOf(week, "2026-11-02").workedMs, 7 * HOUR);
  assert.equal(dayOf(week, "2026-11-02").breakMs, HOUR, "real 30 + auto 30");
  assert.equal(dayOf(week, "2026-11-02").shiftMs, 8 * HOUR);
  assert.equal(dayOf(week, "2026-11-03").workedMs, 4 * HOUR + 6.5 * HOUR);
  assert.equal(dayOf(week, "2026-11-04").workedMs, 2 * HOUR);
});

test("hours: an admin-corrected time (adjustedTimestamp) wins", () => {
  const events = [ev("in", "2026-11-03T08:00", { adjustedTimestamp: t("2026-11-03T09:00") }), ev("out", "2026-11-03T12:00")];
  const day = dayOf(hist.buildWeekHistory(events, NOW, TZ, NO_AUTO), "2026-11-03");
  assert.equal(day.workedMs, 3 * HOUR);
  assert.equal(day.items[0].time, "9:00 am");
});

test("walkShifts: computeHours is the sum of walkShifts' closed shifts", () => {
  const events = [
    ev("breakStart", "2026-11-02T06:00"), // before any clock-in: ignored for hours
    ev("in", "2026-11-02T07:00"),
    ev("breakStart", "2026-11-02T09:00"),
    ev("out", "2026-11-02T10:00"), // break never ended: counts as worked (same as before)
    ev("in", "2026-11-03T07:00"),
    ev("in", "2026-11-03T08:00"), // second in: first shift has no clock-out
    ev("out", "2026-11-03T09:00"),
  ];
  const { shifts, orphans } = home.walkShifts(events, NO_AUTO);
  assert.equal(orphans.length, 1);
  assert.deepEqual(
    shifts.map((s) => [s.closed, s.netMs]),
    [
      [true, 3 * HOUR],
      [false, 0],
      [true, HOUR],
    ]
  );
  assert.equal(home.computeHours(events, NOW, TZ, NO_AUTO).weekMs, 4 * HOUR);
});

// ---- missing clock-out / in progress ----

test("missing clock-out: a clock-in with no clock-out that isn't the current shift", () => {
  const events = [ev("in", "2026-11-02T07:00"), ev("breakStart", "2026-11-02T11:00"), ev("in", "2026-11-03T07:00"), ev("out", "2026-11-03T15:00")];
  const week = hist.buildWeekHistory(events, NOW, TZ, NO_AUTO);
  const mon = dayOf(week, "2026-11-02");
  assert.equal(mon.missingClockOut, true);
  assert.equal(mon.inProgress, false);
  assert.equal(mon.workedMs, 0, "not counted, same as Home");
  assert.deepEqual(
    mon.items.map((i) => [i.type, i.label, i.tone]),
    [
      ["in", "Clock in", "green"],
      ["breakStart", "Start break", "orange"],
      ["missingOut", "Missing clock-out", "orange"],
    ]
  );
  assert.equal(dayOf(week, "2026-11-03").missingClockOut, false);
});

test("in progress: today's open shift shows In progress, not missing, not counted yet", () => {
  const events = [ev("in", "2026-11-04T08:00"), ev("breakStart", "2026-11-04T12:00")];
  const today = dayOf(hist.buildWeekHistory(events, NOW, TZ, NO_AUTO), "2026-11-04");
  assert.equal(today.inProgress, true);
  assert.equal(today.missingClockOut, false);
  assert.equal(today.workedMs, 0);
  assert.equal(today.hasActivity, true);
  assert.deepEqual(today.items[today.items.length - 1], { id: `${events[0].id}-progress`, type: "inProgress", label: "In progress", tone: "green", time: "", tag: null });
});

test("in progress: still clocked in from yesterday (the current shift) is In progress, not missing", () => {
  const events = [ev("in", "2026-11-03T22:00")];
  const tue = dayOf(hist.buildWeekHistory(events, NOW, TZ, NO_AUTO), "2026-11-03");
  assert.equal(tue.inProgress, true);
  assert.equal(tue.missingClockOut, false);
});

test("a shift across midnight: all its punches show on its clock-in day", () => {
  const events = [ev("in", "2026-11-03T22:00"), ev("breakStart", "2026-11-04T01:00"), ev("breakEnd", "2026-11-04T01:30"), ev("out", "2026-11-04T05:00")];
  const week = hist.buildWeekHistory(events, NOW, TZ, NO_AUTO);
  assert.equal(dayOf(week, "2026-11-03").items.length, 4);
  assert.equal(dayOf(week, "2026-11-04").items.length, 0);
});

test("a punch whose clock-in is before the loaded week shows on its own day, no hours", () => {
  const events = [ev("out", "2026-11-02T06:00")];
  const mon = dayOf(hist.buildWeekHistory(events, NOW, TZ, NO_AUTO), "2026-11-02");
  assert.deepEqual(
    mon.items.map((i) => i.type),
    ["out"]
  );
  assert.equal(mon.workedMs, 0);
  assert.equal(mon.hasActivity, true);
});

// ---- every punch and break, with its tag ----

test("items: every punch and break in order, lowercase company-time times", () => {
  const events = [ev("out", "2026-11-03T15:42"), ev("breakEnd", "2026-11-03T12:32"), ev("breakStart", "2026-11-03T12:02"), ev("in", "2026-11-03T07:30")];
  const tue = dayOf(hist.buildWeekHistory(events, NOW, TZ, NO_AUTO), "2026-11-03");
  assert.deepEqual(
    tue.items.map((i) => `${i.tone} ${i.label} ${i.time}`),
    ["green Clock in 7:30 am", "orange Start break 12:02 pm", "orange End break 12:32 pm", "red Clock out 3:42 pm"]
  );
});

test("tags: Will sync / Synced late / Not synced from real events and the phone's queue", () => {
  const C = "co1";
  const E = "emp1";
  const qi = (requestId, action, local, status, failKind) => ({
    requestId,
    companyId: C,
    employeeId: E,
    action,
    queuedAtMs: t(local),
    createdAt: t(local),
    status,
    failKind: failKind || null,
    syncedAt: status === "synced" ? NOW - MIN : null,
    siteName: "",
  });
  const server = [
    { id: "s1", type: "in", timestamp: t("2026-11-02T07:00"), queued: true, syncedLate: true },
    { id: "s2", type: "out", timestamp: t("2026-11-02T15:00"), queued: true },
    { id: "s3", type: "in", timestamp: t("2026-11-03T07:00") },
  ];
  const items = [
    qi("q1", "breakStart", "2026-11-03T10:00", "waiting"),
    qi("q2", "breakEnd", "2026-11-03T10:30", "syncing"),
    qi("q3", "out", "2026-11-03T15:00", "failed", "notRecorded"),
    qi("q4", "in", "2026-11-04T08:00", "failed", "couldntSync"),
    qi("q6", "breakStart", "2026-11-04T09:00", "failed", "redo"),
    qi("q5", "breakStart", "2026-11-04T10:00", "synced"),
  ];
  const events = q.foldQueuedEvents(server, items, C, E, NOW);
  const week = hist.buildWeekHistory(events, NOW, TZ, NO_AUTO);
  const tags = Object.fromEntries(week.days.flatMap((d) => d.items).map((i) => [i.id, i.tag]));
  assert.equal(tags.s1, "syncedLate");
  assert.equal(tags.s2, null, "queued but on time: no tag");
  assert.equal(tags.s3, null);
  assert.equal(tags.q1, "willSync");
  assert.equal(tags.q2, "willSync");
  assert.equal(tags.q3, "notSynced", "failed for good");
  assert.equal(tags.q4, "notSynced", "a failed punch is always Not synced");
  assert.equal(tags.q6, "notSynced", "an older build's Redo row too");
  assert.equal(tags.q5, null, "just synced, server list not caught up");
  assert.deepEqual(hist.TAG_LABELS, { willSync: "Will sync", syncedLate: "Synced late", notSynced: "Not synced" });
  // Tag colors (decided 2026-11-03): StatusPill tones.
  assert.deepEqual(hist.TAG_TONES, { willSync: "blue", syncedLate: "neutral", notSynced: "red" });

  const mon = dayOf(week, "2026-11-02");
  const tue = dayOf(week, "2026-11-03");
  const wed = dayOf(week, "2026-11-04");
  assert.deepEqual([mon.syncedLate, mon.willSync, mon.notSynced], [true, false, false]);
  assert.deepEqual([tue.syncedLate, tue.willSync, tue.notSynced], [false, true, true]);
  // Wednesday's failed punches are Not synced (no Redo), nothing will sync.
  assert.deepEqual([wed.willSync, wed.notSynced, wed.inProgress], [false, true, true]);
});

test("tags: a queued clock-in and clock-out made offline count as a closed shift (same as Home)", () => {
  const C = "co1";
  const E = "emp1";
  const items = [
    { requestId: "a", companyId: C, employeeId: E, action: "in", queuedAtMs: t("2026-11-04T08:00"), createdAt: 0, status: "waiting", siteName: "" },
    { requestId: "b", companyId: C, employeeId: E, action: "out", queuedAtMs: t("2026-11-04T11:00"), createdAt: 0, status: "waiting", siteName: "" },
  ];
  const events = q.foldQueuedEvents([], items, C, E, NOW);
  const wed = dayOf(hist.buildWeekHistory(events, NOW, TZ, NO_AUTO), "2026-11-04");
  assert.equal(wed.workedMs, 3 * HOUR);
  assert.equal(wed.workedMs, home.computeHours(events, NOW, TZ, NO_AUTO).todayMs);
  assert.equal(wed.items.every((i) => i.tag === "willSync"), true);
});

// ---- Phase 5 Layer 7a: what the screens show ----

const day = (fields) => ({
  key: "2026-11-04",
  label: "Today",
  dateLabel: "Nov 4, 2026",
  workedMs: 0,
  breakMs: 0,
  shiftMs: 0,
  hasActivity: true,
  inProgress: false,
  missingClockOut: false,
  willSync: false,
  syncedLate: false,
  notSynced: false,
  items: [],
  ...fields,
});

test("day card pills: what needs attention first, each with its color", () => {
  assert.deepEqual(hist.dayBadges(day({})), []);
  assert.deepEqual(
    hist.dayBadges(day({ missingClockOut: true, inProgress: true, notSynced: true, willSync: true, syncedLate: true })),
    [
      { label: "Missing clock-out", tone: "orange" },
      { label: "In progress", tone: "green" },
      { label: "Not synced", tone: "red" },
      { label: "Will sync", tone: "blue" },
      { label: "Synced late", tone: "neutral" },
    ]
  );
  assert.deepEqual(hist.dayBadges(day({ syncedLate: true })), [{ label: "Synced late", tone: "neutral" }]);
  assert.deepEqual(hist.dayBadges(null), []);
});

test("day timeline rows: each punch with its tag pill; In progress / Missing clock-out rows have none", () => {
  const events = [ev("in", "2026-11-04T07:00", { queued: true, syncedLate: true }), ev("breakStart", "2026-11-04T10:00")];
  const items = [...events, { id: "q1", type: "breakEnd", timestamp: t("2026-11-04T10:30"), queued: true, localStatus: "waiting" }];
  const week = hist.buildWeekHistory(items, NOW, TZ, NO_AUTO);
  const rows = hist.timelineRows(dayOf(week, "2026-11-04"));
  assert.deepEqual(
    rows.map((r) => [r.label, r.time, r.tone, r.tag]),
    [
      ["Clock in", "7:00 am", "green", { label: "Synced late", tone: "neutral" }],
      ["Start break", "10:00 am", "orange", null],
      ["End break", "10:30 am", "orange", { label: "Will sync", tone: "blue" }],
      ["In progress", "", "green", null],
    ]
  );
  assert.ok(rows.every((r) => typeof r.id === "string" && r.id));
  assert.ok(rows.every((r) => r.warn === false), "nothing missing today");
  // Missing clock-out: its row is the one shown in orange text.
  const missWeek = hist.buildWeekHistory([ev("in", "2026-11-02T07:00"), ev("in", "2026-11-04T07:00")], NOW, TZ, NO_AUTO);
  const missRows = hist.timelineRows(dayOf(missWeek, "2026-11-02"));
  assert.deepEqual(missRows.map((r) => [r.label, r.warn]), [["Clock in", false], ["Missing clock-out", true]]);
  assert.deepEqual(hist.timelineRows(null), []);
  assert.deepEqual(hist.timelineRows(day({ items: [] })), []);
});

test("day lookup: a day of this week by key; any other key -> null", () => {
  const week = hist.buildWeekHistory([ev("in", "2026-11-03T07:00"), ev("out", "2026-11-03T15:00")], NOW, TZ, NO_AUTO);
  assert.equal(hist.findDay(week.days, "2026-11-03").workedMs, 8 * HOUR);
  assert.equal(hist.findDay(week.days, "2026-10-01"), null);
  assert.equal(hist.findDay(week.days, ""), null);
  assert.equal(hist.findDay(undefined, "2026-11-03"), null);
});
