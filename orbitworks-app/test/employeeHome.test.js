// Employee App Home logic (lib/employeeHome.js) - status, buttons, timers,
// hours and error messages. Run: node --test test/employeeHome.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("../lib/employeeHome");

const TZ = "America/Chicago";
// Chicago time (CDT, UTC-5 in late October 2026). 2026-10-19 is a Monday.
const t = (s) => Date.parse(`${s}:00-05:00`);
const ev = (type, at, extra = {}) => ({ type, timestamp: { toMillis: () => t(at) }, ...extra });
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// ===================== status + timers =====================

test("no events: clocked out, Clock In", () => {
  const s = h.deriveHomeState([], t("2026-10-21T09:00"), TZ);
  assert.equal(s.status, "out");
  assert.deepEqual(h.buttonsFor(s.status, true), ["clockIn"]);
});

test("clocked in: shift timer = worked time so far", () => {
  const s = h.deriveHomeState([ev("in", "2026-10-21T08:00", { siteName: "Site One" })], t("2026-10-21T10:30"), TZ);
  assert.equal(s.status, "in");
  assert.equal(s.workedMs, 2.5 * HOUR);
  assert.equal(s.shiftInMs, t("2026-10-21T08:00"));
  assert.equal(s.shiftSiteName, "Site One");
  assert.deepEqual(h.buttonsFor(s.status, true), ["startBreak", "clockOut"]);
});

test("on break: break timer counts up from break start; shift timer paused", () => {
  const events = [ev("in", "2026-10-21T08:00"), ev("breakStart", "2026-10-21T12:00")];
  const at1 = h.deriveHomeState(events, t("2026-10-21T12:10"), TZ);
  const at2 = h.deriveHomeState(events, t("2026-10-21T12:25"), TZ);
  assert.equal(at1.status, "break");
  assert.equal(at1.breakStartMs, t("2026-10-21T12:00"));
  assert.equal(t("2026-10-21T12:25") - at2.breakStartMs, 25 * MIN);
  assert.equal(at1.workedMs, 4 * HOUR);
  assert.equal(at2.workedMs, 4 * HOUR);
  assert.deepEqual(h.buttonsFor(at1.status, true), ["endBreak"]);
});

test("after a break the shift timer excludes it", () => {
  const events = [ev("in", "2026-10-21T08:00"), ev("breakStart", "2026-10-21T12:00"), ev("breakEnd", "2026-10-21T12:30")];
  const s = h.deriveHomeState(events, t("2026-10-21T13:00"), TZ);
  assert.equal(s.status, "in");
  assert.equal(s.workedMs, 4.5 * HOUR);
});

test("clocked out today: Done for the day + Clock Back In; out yesterday: Clock In", () => {
  const events = [ev("in", "2026-10-21T08:00"), ev("out", "2026-10-21T16:00")];
  const done = h.deriveHomeState(events, t("2026-10-21T17:00"), TZ);
  assert.equal(done.status, "done");
  assert.deepEqual(h.buttonsFor(done.status, true), ["clockBackIn"]);
  const nextDay = h.deriveHomeState(events, t("2026-10-22T07:00"), TZ);
  assert.equal(nextDay.status, "out");
});

test("reopening the app: same state from the same events in any order (desc query)", () => {
  const events = [ev("in", "2026-10-21T08:00"), ev("breakStart", "2026-10-21T12:00"), ev("out", "2026-10-20T16:00"), ev("in", "2026-10-20T08:00")];
  const asc = h.deriveHomeState(events, t("2026-10-21T12:05"), TZ);
  const desc = h.deriveHomeState(events.slice().reverse(), t("2026-10-21T12:05"), TZ);
  assert.deepEqual(asc, desc);
  assert.equal(asc.status, "break");
  assert.equal(asc.shiftInMs, t("2026-10-21T08:00"));
});

test("an admin-corrected time (adjustedTimestamp) wins", () => {
  const s = h.deriveHomeState(
    [ev("in", "2026-10-21T08:00", { adjustedTimestamp: { toMillis: () => t("2026-10-21T07:30") } })],
    t("2026-10-21T08:30"),
    TZ
  );
  assert.equal(s.workedMs, HOUR);
});

test("shift site: blank when the clock-in had no site", () => {
  const s = h.deriveHomeState([ev("in", "2026-10-21T08:00", { siteId: null, siteName: "Not specified" })], t("2026-10-21T09:00"), TZ);
  assert.equal(s.shiftSiteName, "");
});

test("inactive: no clock or break buttons in any state", () => {
  for (const status of ["out", "in", "break", "done"]) {
    assert.deepEqual(h.buttonsFor(status, false), []);
    assert.deepEqual(h.buttonsFor(status, undefined), []);
  }
});

test("buttons map to the right callable actions", () => {
  assert.equal(h.BUTTON_ACTION.clockIn, "in");
  assert.equal(h.BUTTON_ACTION.clockBackIn, "in");
  assert.equal(h.BUTTON_ACTION.clockOut, "out");
  assert.equal(h.BUTTON_ACTION.startBreak, "breakStart");
  assert.equal(h.BUTTON_ACTION.endBreak, "breakEnd");
});

// ===================== hours (same rules as the website) =====================

const NO_AUTO = { automaticBreakMinutes: 0, minimumShiftHours: 0 };
const NOW = t("2026-10-21T18:00"); // Wednesday

test("hours: closed shift minus real break, today and week", () => {
  const events = [
    ev("in", "2026-10-21T08:00"),
    ev("breakStart", "2026-10-21T12:00"),
    ev("breakEnd", "2026-10-21T12:30"),
    ev("out", "2026-10-21T16:30"),
  ];
  const r = h.computeHours(events, NOW, TZ, NO_AUTO);
  assert.equal(r.todayMs, 8 * HOUR);
  assert.equal(r.weekMs, 8 * HOUR);
});

test("hours: an open shift is not counted (website counts closed shifts only)", () => {
  const r = h.computeHours([ev("in", "2026-10-21T08:00")], NOW, TZ, NO_AUTO);
  assert.equal(r.todayMs, 0);
  assert.equal(r.weekMs, 0);
});

test("hours: auto break applies to a long enough closed shift only", () => {
  const auto = { automaticBreakMinutes: 30, minimumShiftHours: 6 };
  const long = h.computeHours([ev("in", "2026-10-21T08:00"), ev("out", "2026-10-21T16:00")], NOW, TZ, auto);
  assert.equal(long.todayMs, 7.5 * HOUR);
  const short = h.computeHours([ev("in", "2026-10-21T08:00"), ev("out", "2026-10-21T12:00")], NOW, TZ, auto);
  assert.equal(short.todayMs, 4 * HOUR);
  // Stacks with a real break, capped at the shift length.
  const both = h.computeHours(
    [ev("in", "2026-10-21T08:00"), ev("breakStart", "2026-10-21T12:00"), ev("breakEnd", "2026-10-21T12:15"), ev("out", "2026-10-21T16:00")],
    NOW,
    TZ,
    auto
  );
  assert.equal(both.todayMs, 8 * HOUR - 45 * MIN);
});

test("hours: week starts Monday; last Sunday and last week are not this week", () => {
  const events = [
    ev("in", "2026-10-18T09:00"), // Sunday - previous week
    ev("out", "2026-10-18T13:00"),
    ev("in", "2026-10-19T08:00"), // Monday
    ev("out", "2026-10-19T12:00"),
    ev("in", "2026-10-20T08:00"), // Tuesday
    ev("out", "2026-10-20T14:00"),
    ev("in", "2026-10-21T08:00"), // Wednesday (today)
    ev("out", "2026-10-21T10:00"),
  ];
  const r = h.computeHours(events, NOW, TZ, NO_AUTO);
  assert.equal(r.todayMs, 2 * HOUR);
  assert.equal(r.weekMs, 12 * HOUR);
});

test("hours: a shift across midnight counts on its clock-in day", () => {
  const events = [ev("in", "2026-10-20T22:00"), ev("out", "2026-10-21T02:00")];
  const r = h.computeHours(events, NOW, TZ, NO_AUTO);
  assert.equal(r.todayMs, 0);
  assert.equal(r.weekMs, 4 * HOUR);
});

test("hours: days are Chicago days, not UTC days", () => {
  // Sunday 23:30 Chicago is already Monday 04:30 UTC - still last week.
  const events = [ev("in", "2026-10-18T20:00"), ev("out", "2026-10-18T23:30")];
  const r = h.computeHours(events, t("2026-10-19T08:00"), TZ, NO_AUTO);
  assert.equal(r.weekMs, 0);
  assert.equal(h.dayKey(t("2026-10-18T23:30"), TZ), "2026-10-18");
  assert.equal(h.weekKey(t("2026-10-18T23:30"), TZ), "2026-10-12");
  assert.equal(h.weekKey(t("2026-10-21T12:00"), TZ), "2026-10-19");
});

test("week query start covers Monday 00:00 Chicago", () => {
  const start = h.weekQueryStartMs(t("2026-10-21T12:00"), TZ);
  assert.ok(start <= t("2026-10-19T00:00"));
  assert.ok(start > t("2026-10-17T00:00"));
});

// ===================== formatting =====================

test("timer and hours formatting", () => {
  assert.equal(h.formatTimer(0), "0:00:00");
  assert.equal(h.formatTimer(3 * HOUR + 4 * MIN + 5000), "3:04:05");
  assert.equal(h.formatTimer(-5), "0:00:00");
  assert.equal(h.formatHours(7 * HOUR + 45 * MIN), "7h 45m");
  assert.equal(h.formatHours(0), "0h 00m");
  assert.equal(h.formatClockTime(t("2026-10-21T08:05"), TZ), "8:05 AM");
});

// ===================== errors =====================

const httpsErr = (reason, message, extra = {}) => ({ code: "functions/x", message, details: { reason, ...extra } });

test("errors: the callable's own plain message is shown", () => {
  for (const [reason, message] of [
    ["wrongPin", "Wrong PIN. 2 tries left before a 1-minute lock."],
    ["locked", "Too many wrong PINs. Try again in 60 seconds."],
    ["wrongState", "You're already clocked in."],
    ["inactive", "Your account is inactive, speak to your admin"],
    ["photo", "Your photo didn't upload. Retake it and try again."],
  ]) {
    assert.equal(h.clockErrorMessage(httpsErr(reason, message), true), message);
  }
});

test("errors: no signal", () => {
  assert.equal(h.clockErrorMessage(httpsErr("wrongPin", "x"), false), h.NO_SIGNAL);
  assert.equal(h.clockErrorMessage({ code: "functions/unavailable", message: "unavailable" }, true), h.NO_SIGNAL);
  assert.equal(h.clockErrorMessage({ code: "functions/deadline-exceeded", message: "deadline" }, true), h.NO_SIGNAL);
  assert.equal(h.clockErrorMessage(new Error("Network request failed"), true), h.NO_SIGNAL);
  assert.equal(h.clockErrorMessage({ code: "functions/internal", message: "INTERNAL" }, true), h.GENERIC_ERROR);
});

test("errors: where the clock flow goes next", () => {
  assert.equal(h.errorStep(httpsErr("wrongPin", "x")), "pin");
  assert.equal(h.errorStep(httpsErr("locked", "x", { secondsLeft: 42 })), "pin");
  assert.equal(h.lockSecondsLeft(httpsErr("locked", "x", { secondsLeft: 42 })), 42);
  assert.equal(h.errorStep(httpsErr("photo", "x")), "camera");
  assert.equal(h.errorStep(httpsErr("wrongState", "x")), "close");
  assert.equal(h.errorStep(httpsErr("inactive", "x")), "close");
  assert.equal(h.errorStep({ code: "functions/unavailable" }), "retry");
});

test("PIN check (before the camera): what the server's answer does", () => {
  // Wrong PIN / lock from the check: back to the PIN pad with the message
  // or countdown - the camera never opens.
  const wrong = httpsErr("wrongPin", "Wrong PIN. 1 try left before a 1-minute lock.", { attemptsLeft: 1 });
  assert.equal(h.errorStep(wrong), "pin");
  assert.equal(h.clockErrorMessage(wrong, true), "Wrong PIN. 1 try left before a 1-minute lock.");
  const locked = httpsErr("locked", "Too many wrong PINs. Try again in 60 seconds.", { secondsLeft: 60 });
  assert.equal(h.errorStep(locked), "pin");
  assert.equal(h.lockSecondsLeft(locked), 60);
  // Inactive / signed into the wrong account: stop with the message.
  assert.equal(h.errorStep(httpsErr("inactive", "x")), "close");
  assert.equal(h.errorStep(httpsErr("wrongAccount", "x")), "close");
  // No signal: Try again (repeats the check).
  assert.equal(h.errorStep({ code: "functions/unavailable" }), "retry");
  // PIN OK: camera; or, with a photo already kept, send it straight away.
  assert.equal(h.stepAfterPinOk(false), "camera");
  assert.equal(h.stepAfterPinOk(true), "sending");
});

test("photo path is the punch's own file", () => {
  assert.equal(h.photoPathFor("c1", "e1", "r-1"), "companies/c1/clockEvents/e1/r-1.jpg");
});

// ===================== home card display =====================

test("timer card digits: HH:MM:SS, break MM:SS", () => {
  assert.equal(h.formatTimerDigits(0), "00:00:00");
  assert.equal(h.formatTimerDigits(2 * HOUR + 14 * MIN + 5000), "02:14:05");
  assert.equal(h.formatTimerDigits(-5), "00:00:00");
  assert.equal(h.formatBreakDigits(12 * MIN + 40000), "12:40");
  assert.equal(h.formatBreakDigits(75 * MIN + 3000), "75:03");
});

test("greeting follows the company timezone hour", () => {
  assert.equal(h.greetingFor(t("2026-10-21T08:00"), TZ), "Good morning");
  assert.equal(h.greetingFor(t("2026-10-21T12:00"), TZ), "Good afternoon");
  assert.equal(h.greetingFor(t("2026-10-21T17:30"), TZ), "Good evening");
  assert.equal(h.greetingFor(t("2026-10-21T00:15"), TZ), "Good morning");
});
