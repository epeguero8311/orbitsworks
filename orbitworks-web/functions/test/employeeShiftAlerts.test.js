// Phase 7 - employeeShiftAlerts.ts: when shift ending / still clocked in
// are due, the open shift's start, and the alert text. Pure, no emulator.
// Runs the compiled lib/ (npm run build first).
// Run: node --test test/employeeShiftAlerts.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("../lib/employeeShiftAlerts");

// 2026-10-21 is CDT (UTC-5), no daylight-saving change.
const at = (hhmm, day = "2026-10-21") => Date.parse(`${day}T${hhmm}:00-05:00`);
const CLOSE = 17 * 60; // 5:00 PM

const ts = (ms) => ({ toDate: () => new Date(ms) });
const ev = (id, type, ms) => ({ id, employeeId: "e1", type, timestamp: ts(ms) });

test("parseHHMM / formatMinutesOfDay", () => {
  assert.equal(s.parseHHMM("17:00"), 1020);
  assert.equal(s.parseHHMM("8:30"), 510);
  assert.equal(s.parseHHMM(" 09:05 "), 545);
  for (const bad of [undefined, null, "", "25:00", "17:60", "5pm", 1700]) assert.equal(s.parseHHMM(bad), null);
  assert.equal(s.formatMinutesOfDay(1020), "5:00 PM");
  assert.equal(s.formatMinutesOfDay(0), "12:00 AM");
  assert.equal(s.formatMinutesOfDay(12 * 60 + 5), "12:05 PM");
  assert.equal(s.formatMinutesOfDay(9 * 60 + 30), "9:30 AM");
});

test("openShiftStart: first event after the last clock-out, out-of-order input", () => {
  const events = [
    ev("b2", "breakEnd", at("12:30")),
    ev("in2", "in", at("08:00")),
    ev("out1", "out", at("07:00", "2026-10-20")),
    ev("b1", "breakStart", at("12:00")),
    ev("in1", "in", at("06:00", "2026-10-20")),
  ];
  assert.equal(s.openShiftStart(events).id, "in2");
  assert.equal(s.openShiftStart([ev("in", "in", at("06:00"))]).id, "in");
  assert.equal(s.openShiftStart([ev("in", "in", at("06:00")), ev("o", "out", at("07:00"))]), null);
  assert.equal(s.openShiftStart([]), null);
});

test("openShiftStart: adjustedTimestamp wins over timestamp (same as hours)", () => {
  const moved = { id: "in", employeeId: "e1", type: "in", timestamp: ts(at("10:00")), adjustedTimestamp: ts(at("06:00")) };
  const out = ev("out", "out", at("08:00", "2026-10-20"));
  assert.equal(s.openShiftStart([moved, out]).id, "in");
});

test("shiftEndingDue: 4:45 to 4:59 PM for a shift started before close today", () => {
  const due = (now, start = at("08:00")) => s.shiftEndingDue({ shiftStartMs: start, nowMs: now, closeMinutes: CLOSE });
  assert.equal(due(at("16:44")), false);
  assert.equal(due(at("16:45")), true);
  assert.equal(due(at("16:59")), true);
  assert.equal(due(at("17:00")), false);
  assert.equal(due(at("17:30")), false);
});

test("shiftEndingDue: never for a shift started at/after close or on an earlier day", () => {
  const due = (start, now = at("16:50")) => s.shiftEndingDue({ shiftStartMs: start, nowMs: now, closeMinutes: CLOSE });
  assert.equal(due(at("17:00")), false);
  assert.equal(due(at("22:00", "2026-10-20")), false); // overnight crew from yesterday
  assert.equal(due(at("08:00", "2026-10-20")), false);
  assert.equal(due(at("16:47")), true); // started just before close - still a shift that ends at close
});

test("stillClockedInDue: close + delay, until midnight; uses 30 when the delay is bad", () => {
  const due = (now, delay, start = at("08:00")) =>
    s.stillClockedInDue({ shiftStartMs: start, nowMs: now, closeMinutes: CLOSE, delayMinutes: delay });
  assert.equal(due(at("17:29"), 30), false);
  assert.equal(due(at("17:30"), 30), true);
  assert.equal(due(at("23:59"), 30), true);
  assert.equal(due(at("17:00"), 0), true);
  assert.equal(due(at("17:44"), 45), false);
  assert.equal(due(at("17:45"), 45), true);
  assert.equal(due(at("17:29"), NaN), false);
  assert.equal(due(at("17:30"), NaN), true);
  assert.equal(due(at("17:30"), -5), true);
});

test("stillClockedInDue: never for a shift started after close (overnight) or yesterday", () => {
  const due = (start, now) => s.stillClockedInDue({ shiftStartMs: start, nowMs: now, closeMinutes: CLOSE, delayMinutes: 30 });
  assert.equal(due(at("18:00"), at("20:00")), false);
  assert.equal(due(at("08:00", "2026-10-20"), at("09:00")), false);
});

test("alert text says why it fired, ASCII only", () => {
  const all = [
    s.shiftEndingText(CLOSE),
    s.stillClockedInText(CLOSE, 30),
    s.maxHoursText(8.27, 8),
    s.overtimeText(41, 40),
  ];
  assert.deepEqual(all.map((a) => a.alertType), ["shiftEnding", "stillClockedIn", "maxHours", "overtime"]);
  assert.match(all[0].message, /5:00 PM/);
  assert.match(all[0].reason, /15 minutes before/);
  assert.match(all[1].reason, /5:00 PM.*30 minutes later/);
  assert.equal(all[2].message, "You have worked 8.2 hours this shift.");
  assert.match(all[2].reason, /8 hours in one shift/);
  assert.equal(all[3].message, "You have worked 41 hours this week.");
  assert.match(all[3].reason, /40 hours/);
  for (const a of all) {
    for (const v of [a.title, a.message, a.reason]) assert.ok(/^[\x20-\x7E]+$/.test(v), v);
  }
});
