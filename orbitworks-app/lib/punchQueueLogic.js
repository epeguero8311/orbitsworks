// Employee App Phase 4 - the rules behind the offline punch queue, with no
// React Native, Expo or Firebase imports so test/punchQueueLogic.test.js
// can run them under `node --test` (same pattern as employeeHome.js).
//
// A queued punch is one the phone saved instead of sending: no signal, a
// slow PIN check (3 s) or a slow upload + punch (5 s), or older punches
// still waiting in front of it. It is sent later, oldest first, with
// queuedAtMs = when the employee made it. The server decides if it counts
// (see orbitworks-web/functions/src/employeeClockQueued.ts).

const { dayKey, effectiveMs, formatClockTime, sortEvents, toMs } = require("./employeeHome");

const SECOND_MS = 1000;
const HOUR_MS = 60 * 60 * SECOND_MS;
const DAY_MS = 24 * HOUR_MS;

const PIN_CHECK_TIMEOUT_MS = 3 * SECOND_MS;
const PUNCH_TIMEOUT_MS = 5 * SECOND_MS;
// Same window as the server (QUEUED_MAX_AGE_MS): older than this can't be
// recorded, and a saved PIN is deleted.
const QUEUED_MAX_AGE_MS = DAY_MS;
const PIN_KEEP_MS = DAY_MS;
const SYNCED_KEEP_MS = DAY_MS;

const NOT_RECORDED_MESSAGE = "Not recorded, tell your admin.";
const COULDNT_SYNC_MESSAGE = "Couldn't sync, please speak to your supervisor.";
const WRONG_PIN_MESSAGE = "Wrong PIN. Type your PIN again to send this punch.";
const WILL_SYNC_NOTE = "Will sync when online";

// status: "waiting" | "syncing" | "synced" | "failed"
const OPEN_STATUSES = ["waiting", "syncing", "failed"];

// ---- error sorting ----

const NETWORK_CODES = [
  "timeout",
  "functions/unavailable",
  "functions/deadline-exceeded",
  "functions/internal",
  "unavailable",
  "deadline-exceeded",
  "internal",
];
const REDO_REASONS = ["wrongPin"];
const NOT_RECORDED_REASONS = ["photo", "tooOld", "superseded"];
const COULDNT_SYNC_REASONS = ["inactive", "wrongAccount", "invalid", "wrongState", "badTime", "syncBlocked", "locked"];
const PERMISSION_CODES = ["functions/permission-denied", "permission-denied"];

// What a failed send means:
//   "retry"       - signal, a timeout or a server hiccup: stays Waiting
//   "redo"        - wrong PIN: type it again (Redo)
//   "notRecorded" - can never be recorded: "Not recorded, tell your admin" + Remove
//   "couldntSync" - any other failure for good: "Couldn't sync..." + Remove
function failKind(err) {
  const reason = err && err.details && err.details.reason;
  if (REDO_REASONS.includes(reason)) return "redo";
  if (NOT_RECORDED_REASONS.includes(reason)) return "notRecorded";
  if (COULDNT_SYNC_REASONS.includes(reason)) return "couldntSync";
  const code = err && typeof err.code === "string" ? err.code : "";
  if (PERMISSION_CODES.includes(code)) return "couldntSync";
  return "retry";
}

// true = the online punch didn't get through for a signal reason, so the
// phone saves it instead of showing an error.
function isSignalError(err) {
  if (failKind(err) !== "retry") return false;
  const reason = err && err.details && err.details.reason;
  if (reason === "notSignedIn") return false;
  const code = err && typeof err.code === "string" ? err.code : "";
  const message = err && typeof err.message === "string" ? err.message : "";
  return reason === "generic" || NETWORK_CODES.includes(code) || /network|timed? ?out|internet|offline|fetch/i.test(message);
}

function failMessage(kind) {
  if (kind === "redo") return WRONG_PIN_MESSAGE;
  if (kind === "notRecorded") return NOT_RECORDED_MESSAGE;
  if (kind === "couldntSync") return COULDNT_SYNC_MESSAGE;
  return "";
}

// The one button a Failed row offers: "redo" or "remove".
function rowAction(item) {
  if (!item || item.status !== "failed") return null;
  return item.failKind === "redo" ? "redo" : "remove";
}

// ---- time ----

// The time saved with a queued punch: the phone's time, but always after
// the last punch Home knows about (the server refuses one that isn't).
function queuedTimeFor(nowMs, lastEventMs) {
  if (typeof lastEventMs === "number" && lastEventMs >= nowMs) return lastEventMs + SECOND_MS;
  return nowMs;
}

function isTooOld(item, nowMs) {
  return nowMs - item.queuedAtMs > QUEUED_MAX_AGE_MS;
}

// Rejects with { code: "timeout" } if the promise takes longer than ms.
// The promise itself keeps running (a punch already sent can't be
// recalled - the server's requestId makes a resend safe).
function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error("timed out");
      err.code = "timeout";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---- queue order ----

function byQueuedTime(a, b) {
  return a.queuedAtMs - b.queuedAtMs || a.createdAt - b.createdAt;
}

function mine(items, companyId, employeeId) {
  return items.filter((i) => i.companyId === companyId && i.employeeId === employeeId);
}

// The next punch to send for this employee, oldest first. null when there
// is nothing to send, or the queue is paused: the oldest unsent punch
// failed for good and waits for Redo or Remove.
function nextToSend(items, companyId, employeeId) {
  const open = mine(items, companyId, employeeId)
    .filter((i) => OPEN_STATUSES.includes(i.status))
    .sort(byQueuedTime);
  const first = open[0];
  if (!first || first.status === "failed") return null;
  return first;
}

function isPaused(items, companyId, employeeId) {
  const open = mine(items, companyId, employeeId)
    .filter((i) => OPEN_STATUSES.includes(i.status))
    .sort(byQueuedTime);
  return !!open[0] && open[0].status === "failed";
}

// Sync tab badge: Waiting + Syncing + Failed.
function badgeCount(items, companyId, employeeId) {
  return mine(items, companyId, employeeId).filter((i) => OPEN_STATUSES.includes(i.status)).length;
}

// true = a new punch must join the queue behind older ones (an online punch
// would make the older ones "Not recorded").
function hasQueueAhead(items, companyId, employeeId) {
  return badgeCount(items, companyId, employeeId) > 0;
}

// Sync tab rows, newest first. Synced rows stay 24 h.
function visibleItems(items, companyId, employeeId, nowMs) {
  return mine(items, companyId, employeeId)
    .filter((i) => i.status !== "synced" || nowMs - (i.syncedAt || 0) < SYNCED_KEEP_MS)
    .sort((a, b) => byQueuedTime(b, a));
}

// ---- cleanup ----

// Saved PINs to delete now (any employee): the punch synced or failed, or
// the PIN is 24 h old.
function pinsToDelete(items, nowMs) {
  return items
    .filter((i) => i.hasPin && (i.status === "synced" || i.status === "failed" || nowMs - i.createdAt >= PIN_KEEP_MS))
    .map((i) => i.requestId);
}

// Synced rows to drop from the phone (any employee): 24 h after syncing.
function syncedToDrop(items, nowMs) {
  return items.filter((i) => i.status === "synced" && nowMs - (i.syncedAt || 0) >= SYNCED_KEEP_MS).map((i) => i.requestId);
}

// ---- Home ----

// Home status, timers and hours count punches still on the phone, so a
// clock-in made offline shows "Clocked in" right away. Each one becomes an
// event at its own time (Failed ones too, until removed - an employee whose
// clock-in needs Redo is still on shift). A punch the server already has
// is never counted twice; one synced in the last 10 minutes fills in until
// the live events catch up (after that the server's events are the truth,
// e.g. if an admin deleted it).
const SYNCED_FOLD_MS = 10 * 60 * 1000;

function foldQueuedEvents(serverEvents, items, companyId, employeeId, nowMs) {
  const known = new Set(serverEvents.map((e) => e.id));
  const extra = mine(items, companyId, employeeId)
    .filter((i) => !known.has(i.requestId))
    .filter((i) => i.status !== "synced" || nowMs - (i.syncedAt || 0) < SYNCED_FOLD_MS)
    .map((i) => ({
      id: i.requestId,
      type: i.action,
      timestamp: i.queuedAtMs,
      siteName: i.siteName || "",
      queued: true,
      localStatus: i.status,
    }));
  if (extra.length === 0) return serverEvents;
  return [...serverEvents, ...extra];
}

// Newest first (the order useMyClockEvents' recent list uses).
function newestFirst(events) {
  return sortEvents(events).reverse();
}

// The last punch time Home knows about, for queuedTimeFor.
function lastEventMs(events) {
  const sorted = sortEvents(events);
  return sorted.length ? effectiveMs(sorted[sorted.length - 1]) : null;
}

// ---- Sync tab / Settings text ----

const ACTION_LABELS = { in: "Clock in", out: "Clock out", breakStart: "Break start", breakEnd: "Break end" };
const STATUS_LABELS = { waiting: "Waiting", syncing: "Syncing", synced: "Synced", failed: "Failed" };
const STATUS_TONES = { waiting: "orange", syncing: "blue", synced: "green", failed: "red" };

// "Today, 9:05 AM" / "Oct 29, 9:05 AM" in the company's timezone.
function formatWhen(ms, nowMs, timeZone) {
  const time = formatClockTime(ms, timeZone);
  if (dayKey(ms, timeZone) === dayKey(nowMs, timeZone)) return `Today, ${time}`;
  const date = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(new Date(ms));
  return `${date}, ${time}`;
}

// ---- offline Home copy (lib/employeeHomeCache.js) ----

function isTimestampLike(value) {
  return !!value && typeof value === "object" && (typeof value.toMillis === "function" || typeof value.seconds === "number");
}

// Clock events as plain JSON for the phone's saved copy: Firestore
// timestamps become millis (toMs in employeeHome.js reads both).
function eventsForCache(events) {
  return events.map((e) => {
    const out = {};
    for (const [k, v] of Object.entries(e)) out[k] = isTimestampLike(v) ? toMs(v) : v;
    return out;
  });
}

module.exports = {
  ACTION_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  formatWhen,
  eventsForCache,
  PIN_CHECK_TIMEOUT_MS,
  PUNCH_TIMEOUT_MS,
  QUEUED_MAX_AGE_MS,
  PIN_KEEP_MS,
  SYNCED_KEEP_MS,
  NOT_RECORDED_MESSAGE,
  COULDNT_SYNC_MESSAGE,
  WRONG_PIN_MESSAGE,
  WILL_SYNC_NOTE,
  failKind,
  isSignalError,
  failMessage,
  rowAction,
  queuedTimeFor,
  isTooOld,
  withTimeout,
  nextToSend,
  isPaused,
  badgeCount,
  hasQueueAhead,
  visibleItems,
  pinsToDelete,
  syncedToDrop,
  foldQueuedEvents,
  newestFirst,
  lastEventMs,
};
