// Employee App Phase 7 - break reminders (lib/breakReminders.js): when the
// three reminders are due, when nothing is scheduled (off, not on break,
// break ended offline), and the phone's log behind the Alerts tab.
// Run: node --test test/breakReminders.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const r = require("../lib/breakReminders");
const h = require("../lib/employeeHome");
const q = require("../lib/punchQueueLogic");

const MIN = 60 * 1000;
const START = Date.parse("2026-11-04T17:00:00Z");

test("15 min limit: 5 left at +10, time up at +15, over limit at +20", () => {
  const plan = r.breakReminderPlan({ breakStartMs: START, breaks: { maxBreakMinutes: 15 }, nowMs: START });
  assert.deepEqual(plan.map((p) => [p.kind, (p.atMs - START) / MIN]), [
    ["fiveLeft", 10],
    ["timeUp", 15],
    ["over", 20],
  ]);
  assert.deepEqual(plan.map((p) => p.id), r.REMINDER_IDS);
  assert.equal(plan[1].body, "Your 15 minute break is over. End your break in the app.");
  assert.equal(plan[2].body, "You are 5 minutes over your 15 minute break. End your break in the app.");
  for (const p of plan) assert.match(p.reason, /15 minute/);
});

test("no limit set = the 15 min default; 30 min limit moves every time", () => {
  const def = r.breakReminderPlan({ breakStartMs: START, breaks: {}, nowMs: START });
  assert.deepEqual(def.map((p) => (p.atMs - START) / MIN), [10, 15, 20]);
  const thirty = r.breakReminderPlan({ breakStartMs: START, breaks: { maxBreakMinutes: 30 }, nowMs: START });
  assert.deepEqual(thirty.map((p) => (p.atMs - START) / MIN), [25, 30, 35]);
});

test("limit of 5 min or less: no '5 minutes left'", () => {
  for (const limit of [5, 3, 1]) {
    const plan = r.breakReminderPlan({ breakStartMs: START, breaks: { maxBreakMinutes: limit }, nowMs: START });
    assert.deepEqual(plan.map((p) => p.kind), ["timeUp", "over"]);
  }
});

test("Max break time warning OFF: nothing", () => {
  assert.deepEqual(r.breakReminderPlan({ breakStartMs: START, breaks: { maxBreakWarning: false, maxBreakMinutes: 15 }, nowMs: START }), []);
  assert.equal(r.reminderKey({ status: "break", breakStartMs: START, breaks: { maxBreakWarning: false } }), "off");
});

test("only reminders still ahead are scheduled (app opened mid-break)", () => {
  const plan = r.breakReminderPlan({ breakStartMs: START, breaks: { maxBreakMinutes: 15 }, nowMs: START + 12 * MIN });
  assert.deepEqual(plan.map((p) => p.kind), ["timeUp", "over"]);
  assert.deepEqual(r.breakReminderPlan({ breakStartMs: START, breaks: { maxBreakMinutes: 15 }, nowMs: START + 20 * MIN }), []);
  assert.deepEqual(r.breakReminderPlan({ breakStartMs: null, breaks: {}, nowMs: START }), []);
});

test("reminderKey: same break = same key (no reschedule every second), else changes", () => {
  const k = (status, startMs, breaks = { maxBreakMinutes: 15 }) => r.reminderKey({ status, breakStartMs: startMs, breaks });
  assert.equal(k("break", START), k("break", START));
  assert.notEqual(k("break", START), k("break", START + MIN));
  assert.notEqual(k("break", START), k("break", START, { maxBreakMinutes: 30 }));
  assert.equal(k("in", null), "none");
  assert.equal(k("out", null), "none");
  assert.equal(k("done", null), "none");
});

// The hook reads Home's status, which already folds in the phone's queue:
// a break started or ended offline changes the key at once.
const C = "co1";
const E = "emp1";
const server = (id, type, ms) => ({ id, employeeId: E, type, timestamp: { toMillis: () => ms, toDate: () => new Date(ms) } });
const queued = (requestId, action, ms) => ({ requestId, companyId: C, employeeId: E, action, queuedAtMs: ms, status: "waiting" });

function homeFrom(serverEvents, queue, nowMs) {
  const recent = q.newestFirst(q.foldQueuedEvents(serverEvents, queue, C, E, nowMs));
  return h.deriveHomeState(recent, nowMs, "America/Chicago");
}

test("offline: break started on the phone -> key for that break; ended offline -> cancel", () => {
  const inMs = START - 3 * 60 * MIN;
  const serverEvents = [server("in1", "in", inMs)];
  const onBreak = homeFrom(serverEvents, [queued("L1", "breakStart", START)], START + MIN);
  assert.equal(onBreak.status, "break");
  assert.equal(onBreak.breakStartMs, START);
  assert.equal(r.reminderKey({ status: onBreak.status, breakStartMs: onBreak.breakStartMs, breaks: {} }), `${START}:15`);

  const ended = homeFrom(serverEvents, [queued("L1", "breakStart", START), queued("L2", "breakEnd", START + 8 * MIN)], START + 9 * MIN);
  assert.equal(ended.status, "in");
  assert.equal(r.reminderKey({ status: ended.status, breakStartMs: ended.breakStartMs, breaks: {} }), "none");
});

test("log: cancel drops reminders that never fired, keeps fired ones; tab shows fired only, newest first", () => {
  const plan = r.breakReminderPlan({ breakStartMs: START, breaks: { maxBreakMinutes: 15 }, nowMs: START });
  let log = r.addScheduled([], plan, START);
  assert.equal(log.length, 3);
  assert.deepEqual(r.firedReminders(log, START + 12 * MIN).map((e) => e.kind), ["fiveLeft"]);
  // Break ended at +12: "time up" and "over" never fired.
  log = r.dropUnfired(log, START + 12 * MIN);
  assert.deepEqual(log.map((e) => e.kind), ["fiveLeft"]);
  // Next break, all three fire.
  const next = START + 3 * 60 * MIN;
  log = r.addScheduled(log, r.breakReminderPlan({ breakStartMs: next, breaks: {}, nowMs: next }), next);
  assert.deepEqual(r.firedReminders(log, next + 60 * MIN).map((e) => e.kind), ["over", "timeUp", "fiveLeft", "fiveLeft"]);
});

test("log: rescheduling the same break adds no duplicates; old and junk entries dropped", () => {
  const plan = r.breakReminderPlan({ breakStartMs: START, breaks: {}, nowMs: START });
  const log = r.addScheduled(r.addScheduled([], plan, START), plan, START);
  assert.equal(log.length, 3);
  const old = { id: "x:timeUp", kind: "timeUp", atMs: START - 91 * 24 * 60 * MIN };
  assert.deepEqual(r.dropUnfired([old, null, { id: 1 }, ...log], START + 30 * MIN).length, 3);
  assert.equal(r.firedReminders("garbage", START).length, 0);
});

test("log: the tab never shows more than 50", () => {
  let log = [];
  for (let i = 0; i < 30; i++) {
    const s = START + i * 60 * MIN;
    log = r.addScheduled(log, r.breakReminderPlan({ breakStartMs: s, breaks: {}, nowMs: s }), s);
  }
  assert.equal(r.firedReminders(log, START + 40 * 60 * MIN).length, r.LOG_MAX);
});

test("reminder text is ASCII only", () => {
  for (const p of r.breakReminderPlan({ breakStartMs: START, breaks: { maxBreakMinutes: 1 }, nowMs: START - MIN })) {
    for (const v of [p.title, p.body, p.reason]) assert.ok(/^[\x20-\x7E]+$/.test(v), v);
  }
});
