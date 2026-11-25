// Overtime (Task 1) step 4 - the shared OT calculation (lib/overtime.ts),
// plan examples A-E plus overnight, missing clock-out, per-day rounding,
// Overtime OFF, Automatic Break, time zone and the functions mirror.
// Plain Node, no emulator.
// Run via: node --test test/overtime.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeOvertime,
  overtimeDayKey,
  overtimeWeekKey,
  DEFAULT_OVERTIME_TIME_ZONE,
} from "../lib/overtime.ts";
import { applyAutoBreak } from "../lib/autoBreak.ts";

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

// Chicago local time -> epoch ms. Nov 9-15 2026 is CST (UTC-6); DST ended
// Nov 1. Mon Nov 9 2026 is a Monday.
function ct(day, hour, minute = 0) {
  return Date.UTC(2026, 10, day, hour + 6, minute);
}

let seq = 0;
function shift(day, startHour, endHour, jobId = "laborer", opts = {}) {
  seq += 1;
  const startMs = ct(day, Math.floor(startHour), Math.round((startHour % 1) * 60));
  const endMs =
    endHour === null
      ? null
      : endHour >= 24
        ? ct(day + 1, Math.floor(endHour - 24), Math.round((endHour % 1) * 60))
        : ct(day, Math.floor(endHour), Math.round((endHour % 1) * 60));
  return { id: opts.id ?? `s${seq}`, startMs, endMs, breakMs: opts.breakMs ?? 0, jobId };
}

const RATES = {
  laborer: { rate: 15, overtimeRate: null },
  foreman: { rate: 23, overtimeRate: 40 },
  foremanNoOt: { rate: 23, overtimeRate: null },
};
const ratesFor = (jobId) => RATES[jobId] ?? { rate: null, overtimeRate: null };

function settings(over = {}) {
  return {
    enabled: true,
    weeklyThresholdHours: 40,
    dailyThresholdHours: 0,
    weekStartsOn: 1,
    multiplier: 1.5,
    roundOvertimeMinutes: 0,
    automaticBreakMinutes: 0,
    minimumShiftHours: 0,
    timeZone: DEFAULT_OVERTIME_TIME_ZONE,
    ...over,
  };
}

const h = (ms) => Math.round((ms / HOUR) * 10000) / 10000;
const money = (n) => Math.round(n * 100) / 100;

test("A) daily after 8, split shift: 5h -> OT 0, 9h -> OT 6", () => {
  const r = computeOvertime(
    [shift(9, 8, 13), shift(9, 14, 23)],
    settings({ dailyThresholdHours: 8 }),
    ratesFor
  );
  assert.equal(h(r.shifts[0].overtimeMs), 0);
  assert.equal(h(r.shifts[1].overtimeMs), 6);
  assert.equal(h(r.days[0].workedMs), 14);
  assert.equal(h(r.days[0].overtimeMs), 6);
});

test("B) daily 12 + weekly 40, no double count: total OT 6", () => {
  const r = computeOvertime(
    [shift(9, 6, 20), shift(10, 8, 16), shift(11, 8, 16), shift(12, 8, 16), shift(13, 8, 16)],
    settings({ dailyThresholdHours: 12, weeklyThresholdHours: 40 }),
    ratesFor
  );
  assert.equal(h(r.shifts[0].dailyOvertimeMs), 2); // Mon 14h -> 12 regular + 2 daily OT
  assert.equal(h(r.shifts[0].regularMs), 12);
  assert.equal(h(r.shifts[4].weeklyOvertimeMs), 4); // regular 12 + 32 = 44 -> 4 weekly OT on Fri
  assert.equal(h(r.totals.overtimeMs), 6);
  assert.equal(h(r.totals.regularMs), 40);
});

const exampleC = () => [
  shift(9, 7, 17, "laborer"), // 10
  shift(10, 7, 17, "laborer"), // 10
  shift(11, 7, 12, "laborer"), // 5  -> 25h Laborer
  shift(12, 7, 17, "foreman"), // 10
  shift(13, 7, 17, "foreman"), // 10 -> 20h Foreman, crosses 40 on Fri
];

test("C) weekly 40, two jobs, OT on Foreman day at Foreman's $40 OT rate = $920", () => {
  const r = computeOvertime(exampleC(), settings(), ratesFor);
  assert.equal(h(r.totals.overtimeMs), 5);
  assert.equal(h(r.shifts[4].overtimeMs), 5);
  assert.equal(r.shifts[4].overtimeRate, 40);
  assert.equal(money(r.shifts[4].overtimePay), 200);
  assert.equal(money(r.totals.pay), 920);
});

test("D) same as C, Foreman OT rate blank, multiplier 1.5 = $892.50", () => {
  const shifts = exampleC().map((s) => (s.jobId === "foreman" ? { ...s, jobId: "foremanNoOt" } : s));
  const r = computeOvertime(shifts, settings(), ratesFor);
  assert.equal(r.shifts[4].overtimeRate, 34.5);
  assert.equal(money(r.shifts[4].overtimePay), 172.5);
  assert.equal(money(r.totals.pay), 892.5);
});

test("E) 2 jobs same day, daily after 8: $213, day splits per job", () => {
  const r = computeOvertime(
    [shift(12, 7, 12, "laborer"), shift(12, 12.5, 17.5, "foremanNoOt")],
    settings({ dailyThresholdHours: 8 }),
    ratesFor
  );
  const day = r.days[0];
  assert.equal(h(day.workedMs), 10);
  assert.equal(h(day.overtimeMs), 2);
  assert.equal(money(r.totals.pay), 213);
  assert.deepEqual(
    day.jobs.map((j) => [j.jobId, h(j.workedMs), h(j.regularMs), h(j.overtimeMs), money(j.pay)]),
    [
      ["laborer", 5, 5, 0, 75],
      ["foremanNoOt", 5, 3, 2, 138],
    ]
  );
});

test("overnight shift counts on the day it started (6pm-2am)", () => {
  const r = computeOvertime([shift(12, 18, 26)], settings({ dailyThresholdHours: 6 }), ratesFor);
  assert.equal(r.shifts[0].dayKey, "2026-11-12");
  assert.equal(h(r.shifts[0].workedMs), 8);
  assert.equal(h(r.shifts[0].overtimeMs), 2);
});

test("overnight Sunday->Monday stays in the week it started", () => {
  // Sun Nov 15 6pm -> Mon 2am. Monday weeks: belongs to the week of Nov 9.
  const r = computeOvertime([shift(15, 18, 26)], settings(), ratesFor);
  assert.equal(r.shifts[0].weekKey, "2026-11-09");
});

test("missing clock-out: flagged incomplete, counts 0, the rest still combines", () => {
  const r = computeOvertime(
    [shift(9, 8, 13), shift(9, 14, null, "laborer", { id: "open" })],
    settings({ dailyThresholdHours: 8 }),
    ratesFor
  );
  const open = r.shifts.find((s) => s.id === "open");
  assert.equal(open.incomplete, true);
  assert.equal(open.workedMs, 0);
  assert.equal(r.days[0].incomplete, true);
  assert.equal(h(r.days[0].workedMs), 5);
  assert.equal(r.totals.hasIncomplete, true);
});

test("open shift counts up to nowMs only when the caller passes it", () => {
  const r = computeOvertime(
    [shift(9, 8, 13), shift(9, 14, null, "laborer", { id: "open" })],
    settings({ dailyThresholdHours: 8 }),
    ratesFor,
    { nowMs: ct(9, 21) }
  );
  const open = r.shifts.find((s) => s.id === "open");
  assert.equal(open.incomplete, false);
  assert.equal(open.open, true);
  assert.equal(h(r.days[0].workedMs), 12); // 5 + 7 (Max hours example: 12 at 9pm)
  assert.equal(h(open.overtimeMs), 4);
});

test("OT rounding is per day (round up), period total = sum of days", () => {
  // Two days of 8h07m with daily after 8 -> 7 min raw OT each.
  const shifts = [shift(9, 8, 16 + 7 / 60), shift(10, 8, 16 + 7 / 60)];
  const raw = computeOvertime(shifts, settings({ dailyThresholdHours: 8 }), ratesFor);
  assert.equal(Math.round(raw.totals.overtimeMs / MIN), 14);
  const r = computeOvertime(shifts, settings({ dailyThresholdHours: 8, roundOvertimeMinutes: 15 }), ratesFor);
  assert.deepEqual(r.days.map((d) => d.overtimeMs / MIN), [15, 15]);
  assert.equal(r.totals.overtimeMs / MIN, 30);
  // Worked time never changes; the rounding comes out of regular.
  assert.equal(r.totals.workedMs, raw.totals.workedMs);
  assert.equal(r.totals.regularMs + r.totals.overtimeMs, r.totals.workedMs);
});

test("Overtime OFF: no OT at all, everything regular at the straight rate", () => {
  const shifts = [shift(9, 6, 20), shift(10, 6, 20), shift(11, 6, 20), shift(12, 6, 20)]; // 56h
  const r = computeOvertime(shifts, settings({ enabled: false, dailyThresholdHours: 8 }), ratesFor);
  assert.equal(r.totals.overtimeMs, 0);
  assert.equal(h(r.totals.regularMs), 56);
  assert.equal(money(r.totals.pay), 56 * 15);
});

test("Automatic Break: OFF = per shift (today's rule), ON = once per day on combined hours", () => {
  const shifts = [shift(9, 8, 13), shift(9, 14, 19)]; // 5h + 5h
  const ab = { automaticBreakMinutes: 30, minimumShiftHours: 6 };
  const off = computeOvertime(shifts, settings({ enabled: false, ...ab }), ratesFor);
  assert.equal(h(off.totals.workedMs), 10); // neither 5h shift reaches 6h on its own
  const on = computeOvertime(shifts, settings({ enabled: true, ...ab }), ratesFor);
  assert.equal(h(on.totals.workedMs), 9.5); // combined 10h qualifies, deducted once
  assert.equal(on.days[0].automaticBreakMs / MIN, 30);

  const longShifts = [shift(10, 6, 13), shift(10, 14, 21)]; // 7h + 7h
  const offLong = computeOvertime(longShifts, settings({ enabled: false, ...ab }), ratesFor);
  assert.equal(h(offLong.totals.workedMs), 13); // both qualify -> deducted twice, like today
  const onLong = computeOvertime(longShifts, settings({ enabled: true, ...ab }), ratesFor);
  assert.equal(h(onLong.totals.workedMs), 13.5); // once per day
});

test("Overtime OFF matches today's per-shift applyAutoBreak exactly", () => {
  const cases = [
    [8, 0, 30, 6], [5, 0, 30, 6], [6, 0, 30, 6], [9, 45, 30, 0], [0.25, 10, 30, 0], [10, 20, 0, 6],
  ];
  for (const [grossH, realBreakMin, autoMin, minShift] of cases) {
    const startMs = ct(9, 6);
    const s = [{ id: "x", startMs, endMs: startMs + grossH * HOUR, breakMs: realBreakMin * MIN, jobId: "laborer" }];
    const r = computeOvertime(s, settings({ enabled: false, automaticBreakMinutes: autoMin, minimumShiftHours: minShift }), ratesFor);
    const today = applyAutoBreak(grossH * HOUR, realBreakMin * MIN, true, autoMin, minShift);
    assert.equal(r.shifts[0].breakMs, today.breakMs, JSON.stringify([grossH, realBreakMin, autoMin, minShift]));
    assert.equal(r.shifts[0].workedMs, today.netMs);
  }
});

test("tracked breaks are excluded from worked and OT", () => {
  const r = computeOvertime(
    [shift(9, 7, 17, "laborer", { breakMs: 60 * MIN })],
    settings({ dailyThresholdHours: 8 }),
    ratesFor
  );
  assert.equal(h(r.shifts[0].workedMs), 9);
  assert.equal(h(r.shifts[0].overtimeMs), 1);
});

test("one time zone: day boundaries follow the zone passed in", () => {
  const ms = Date.UTC(2026, 10, 13, 5, 30); // 11:30pm Nov 12 Chicago, 12:30am Nov 13 New York
  assert.equal(DEFAULT_OVERTIME_TIME_ZONE, "America/Chicago");
  assert.equal(overtimeDayKey(ms, "America/Chicago"), "2026-11-12");
  assert.equal(overtimeDayKey(ms, "America/New_York"), "2026-11-13");
  const s = [{ id: "x", startMs: ms, endMs: ms + HOUR, breakMs: 0, jobId: "laborer" }];
  assert.equal(computeOvertime(s, settings({ timeZone: "" }), ratesFor).shifts[0].dayKey, "2026-11-12");
  assert.equal(computeOvertime(s, settings({ timeZone: "America/New_York" }), ratesFor).shifts[0].dayKey, "2026-11-13");
});

test("week starts on any day", () => {
  assert.equal(overtimeWeekKey("2026-11-12", 1), "2026-11-09"); // Thu -> Monday week
  assert.equal(overtimeWeekKey("2026-11-12", 0), "2026-11-08"); // Sunday week
  assert.equal(overtimeWeekKey("2026-11-12", 4), "2026-11-12"); // Thursday week
  // Same 45h, split differently by the week start: Sun Nov 8 10h + Mon-Thu 35h.
  const shifts = [shift(8, 7, 17), shift(9, 7, 17), shift(10, 7, 17), shift(11, 7, 17), shift(12, 7, 12)];
  assert.equal(h(computeOvertime(shifts, settings({ weekStartsOn: 0 }), ratesFor).totals.overtimeMs), 5);
  assert.equal(h(computeOvertime(shifts, settings({ weekStartsOn: 1 }), ratesFor).totals.overtimeMs), 0);
});

test("subcontractors: OT hours at the straight rate (no premium)", () => {
  const r = computeOvertime(exampleC(), settings(), ratesFor, { noOvertimePremium: true });
  assert.equal(h(r.totals.overtimeMs), 5);
  assert.equal(r.shifts[4].overtimeRate, 23);
  assert.equal(money(r.totals.pay), 25 * 15 + 20 * 23);
});

test("unknown rate: pay null on that shift, flagged, hours still counted", () => {
  const r = computeOvertime([shift(9, 8, 12, "nojob")], settings(), ratesFor);
  assert.equal(r.shifts[0].pay, null);
  assert.equal(r.totals.missingRate, true);
  assert.equal(h(r.totals.workedMs), 4);
});

test("functions/src/overtime.ts is an exact mirror of lib/overtime.ts", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
  assert.equal(read("functions/src/overtime.ts"), read("lib/overtime.ts"));
});
