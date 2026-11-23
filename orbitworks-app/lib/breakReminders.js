// Employee App Phase 7 - break reminders: the rules, with no React Native,
// Expo or Firebase imports so test/breakReminders.test.js runs them under
// `node --test` (same pattern as employeeHome.js).
//
// Three LOCAL notifications per break, scheduled on the phone when the
// break starts (online or offline) and cancelled when it ends - including
// a break ended offline, which Home already shows from the phone's queue:
//   fiveLeft - 5 min before the company's break limit (only if limit > 5)
//   timeUp   - at the limit
//   over     - limit + 5 min (F8 a: one reminder, never repeats)
// Off when the company turned off "Max break time warning" (same setting
// the website and the server's breakTooLong use).
//
// The phone also keeps a log of the reminders it scheduled, so the Alerts
// tab can show the ones already due (F7 a). A reminder still in the future
// when the break ends is dropped from the log: it never fired.

const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MIN_MS;

const DEFAULT_MAX_BREAK_MINUTES = 15; // same as StatusCard / the server default
const FIVE_LEFT_MINUTES = 5;
const OVER_LIMIT_EXTRA_MINUTES = 5;
const LOG_KEEP_DAYS = 90; // same as server employee alerts (F6)
const LOG_MAX = 50; // the Alerts tab shows the newest 50

const REMINDER_IDS = ["break-five-left", "break-time-up", "break-over-limit"];

function breakLimitMinutes(breaks) {
  const n = Number(breaks && breaks.maxBreakMinutes);
  return n > 0 ? n : DEFAULT_MAX_BREAK_MINUTES;
}

function remindersOn(breaks) {
  return !(breaks && breaks.maxBreakWarning === false);
}

function plural(n) {
  return `${n} minute${n === 1 ? "" : "s"}`;
}

// The reminders for a break that started at breakStartMs, only those still
// in the future. [] when not on a break or reminders are off.
//   -> [{ id, kind, atMs, title, body, reason }]
function breakReminderPlan({ breakStartMs, breaks, nowMs }) {
  if (typeof breakStartMs !== "number" || !Number.isFinite(breakStartMs)) return [];
  if (!remindersOn(breaks)) return [];
  const limit = breakLimitMinutes(breaks);
  const all = [];
  if (limit > FIVE_LEFT_MINUTES) {
    all.push({
      id: REMINDER_IDS[0],
      kind: "fiveLeft",
      atMs: breakStartMs + (limit - FIVE_LEFT_MINUTES) * MIN_MS,
      title: "5 minutes left",
      body: "Your break ends in 5 minutes.",
      reason: `Your company's break limit is ${plural(limit)}.`,
    });
  }
  all.push({
    id: REMINDER_IDS[1],
    kind: "timeUp",
    atMs: breakStartMs + limit * MIN_MS,
    title: "Break time is up",
    body: `Your ${limit} minute break is over. End your break in the app.`,
    reason: `Your company's break limit is ${plural(limit)}.`,
  });
  all.push({
    id: REMINDER_IDS[2],
    kind: "over",
    atMs: breakStartMs + (limit + OVER_LIMIT_EXTRA_MINUTES) * MIN_MS,
    title: "Break over limit",
    body: `You are ${plural(OVER_LIMIT_EXTRA_MINUTES)} over your ${limit} minute break. End your break in the app.`,
    reason: `Sent ${plural(OVER_LIMIT_EXTRA_MINUTES)} after your company's ${limit} minute break limit.`,
  });
  return all.filter((r) => r.atMs > nowMs);
}

// What the phone should have scheduled right now. Same key = nothing to
// do (Home re-renders every second during a break).
function reminderKey({ status, breakStartMs, breaks }) {
  if (status !== "break" || typeof breakStartMs !== "number") return "none";
  if (!remindersOn(breaks)) return "off";
  return `${breakStartMs}:${breakLimitMinutes(breaks)}`;
}

// ---- the log on the phone ----
// [{ id: "<breakStartMs>:<kind>", kind, atMs, title, body, reason, breakStartMs }]

function cleanLog(log) {
  return Array.isArray(log) ? log.filter((e) => e && typeof e.atMs === "number" && typeof e.id === "string") : [];
}

// Drop the reminders that had not fired yet (the break ended or changed),
// and anything older than LOG_KEEP_DAYS.
function dropUnfired(log, nowMs) {
  return cleanLog(log).filter((e) => e.atMs <= nowMs && nowMs - e.atMs <= LOG_KEEP_DAYS * DAY_MS);
}

// Add this break's newly scheduled reminders (no duplicates), newest kept.
function addScheduled(log, plan, breakStartMs) {
  const byId = new Map(cleanLog(log).map((e) => [e.id, e]));
  for (const r of plan) {
    const id = `${breakStartMs}:${r.kind}`;
    byId.set(id, { id, kind: r.kind, atMs: r.atMs, title: r.title, body: r.body, reason: r.reason, breakStartMs });
  }
  return [...byId.values()].sort((a, b) => b.atMs - a.atMs).slice(0, LOG_MAX * 2);
}

// The reminders already due (shown in the Alerts tab), newest first.
function firedReminders(log, nowMs) {
  return dropUnfired(log, nowMs)
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, LOG_MAX);
}

module.exports = {
  DEFAULT_MAX_BREAK_MINUTES,
  FIVE_LEFT_MINUTES,
  OVER_LIMIT_EXTRA_MINUTES,
  LOG_KEEP_DAYS,
  LOG_MAX,
  REMINDER_IDS,
  breakLimitMinutes,
  breakReminderPlan,
  reminderKey,
  dropUnfired,
  addScheduled,
  firedReminders,
};
