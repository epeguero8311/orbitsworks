// Employee App Phase 4 - the rules behind the offline punch queue, with no
// React Native, Expo or Firebase imports so test/punchQueueLogic.test.js
// can run them under `node --test` (same pattern as employeeHome.js).
//
// Every punch is saved on the phone first (green screen at once) and the
// queue sends it, oldest first, with queuedAtMs = when the employee made
// it - straight away when online, later when not. A punch sent within
// 2 min in the same app run also carries its uptime wait, so the server
// uses its own time (fast sync). The server decides if it counts (see
// orbitworks-web/functions/src/employeeClockQueued.ts).

const { dayKey, effectiveMs, formatClockTime, sortEvents, toMs } = require("./employeeHome");

const SECOND_MS = 1000;
const HOUR_MS = 60 * 60 * SECOND_MS;
const DAY_MS = 24 * HOUR_MS;

const PUNCH_TIMEOUT_MS = 5 * SECOND_MS;
// Fast sync (same as the server's FAST_SYNC_MAX_MS): a punch sent within
// this long gets server time minus its wait and looks like an online punch.
const FAST_SYNC_MAX_MS = 2 * 60 * SECOND_MS;
// The uptime wait and the wall-clock wait must agree this closely, else the
// phone slept or its clock was changed and the wait isn't sent.
const CLOCKS_AGREE_MS = 10 * SECOND_MS;
// Sync tab badge: a Waiting/Syncing punch counts only after this long, so a
// punch that syncs in a second never flashes "1". Failed always counts.
const BADGE_DELAY_MS = 10 * SECOND_MS;
// Same window as the server (QUEUED_MAX_AGE_MS): older than this can't be
// recorded, and a saved PIN is deleted.
const QUEUED_MAX_AGE_MS = DAY_MS;
const PIN_KEEP_MS = DAY_MS;
// Sync tab (decided 2026-11-02, S1): Synced rows show for today and the 2
// days before, by punch time in the company's time zone (Wednesday shows
// Monday-Wednesday). Waiting / Syncing / Failed rows always show. The phone
// keeps Synced rows 4 days by the clock, so a row that window shows is
// never deleted early (cleanup doesn't know the time zone).
const SYNC_TAB_DAYS = 3;
const SYNCED_KEEP_MS = 4 * DAY_MS;

const NOT_RECORDED_MESSAGE = "Not recorded, tell your admin.";
const COULDNT_SYNC_MESSAGE = "Couldn't sync, please speak to your supervisor.";
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
const NOT_RECORDED_REASONS = ["photo", "tooOld", "superseded"];
// wrongPin (Phase 5, no Redo): the server already takes the PIN that was
// right at the punch's time (even after an admin changed it), so a wrong
// PIN at sync can never be fixed from the phone.
const COULDNT_SYNC_REASONS = ["inactive", "wrongAccount", "invalid", "wrongState", "badTime", "syncBlocked", "locked", "wrongPin"];
const PERMISSION_CODES = ["functions/permission-denied", "permission-denied"];

// What a failed send means:
//   "retry"       - signal, a timeout or a server hiccup: stays Waiting
//   "notRecorded" - can never be recorded: "Not recorded, tell your admin" + Remove
//   "couldntSync" - any other failure for good: "Couldn't sync..." + Remove
function failKind(err) {
  const reason = err && err.details && err.details.reason;
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
  if (kind === "notRecorded") return NOT_RECORDED_MESSAGE;
  if (kind === "couldntSync") return COULDNT_SYNC_MESSAGE;
  return "";
}

// The one button a Failed row offers: "remove" (Phase 5: no Redo - a row
// an older build left as "redo" is removed the same way).
function rowAction(item) {
  if (!item || item.status !== "failed") return null;
  return "remove";
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

// ---- phone clock checks (fast sync + phoneClockOff) ----
//
// After every successful server call the phone saves an anchor:
// { serverMs, uptimeMs } (lib/clockAnchor.js). Uptime counts from the
// phone's start and can't be changed in Settings, but it pauses while the
// phone sleeps - so any time worked out from it can only lag the real time.

// Wall time "now" from the anchor: serverMs + uptime since. null with no
// anchor, or when uptime went backwards (the phone restarted since).
function expectedTimeFrom(anchor, uptimeNowMs) {
  if (!anchor || !Number.isFinite(anchor.serverMs) || !Number.isFinite(anchor.uptimeMs)) return null;
  if (!Number.isFinite(uptimeNowMs) || uptimeNowMs < anchor.uptimeMs) return null;
  return Math.round(anchor.serverMs + (uptimeNowMs - anchor.uptimeMs));
}

// How long a saved punch has waited, by the uptime clock - sent to the
// server so it can use its own time. Only when the punch was saved in this
// same app run (no kill, no restart), the wait is 2 min or less, and the
// phone's wall clock says the same (no sleep, no clock change). Else null:
// the normal queued rules apply.
function fastWaitMs(item, { sessionId, uptimeNowMs, wallNowMs }) {
  if (!item || !item.sessionId || item.sessionId !== sessionId) return null;
  if (!Number.isFinite(item.uptimeAtMs) || !Number.isFinite(uptimeNowMs) || uptimeNowMs < item.uptimeAtMs) return null;
  const waitMs = uptimeNowMs - item.uptimeAtMs;
  if (waitMs > FAST_SYNC_MAX_MS) return null;
  if (Math.abs(wallNowMs - item.createdAt - waitMs) > CLOCKS_AGREE_MS) return null;
  return Math.round(waitMs);
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
// failed for good and waits for Remove.
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

// Sync tab badge: Failed, plus Waiting + Syncing once they are
// BADGE_DELAY_MS old (with no nowMs, every open punch counts).
function badgeCount(items, companyId, employeeId, nowMs) {
  return mine(items, companyId, employeeId).filter(
    (i) =>
      OPEN_STATUSES.includes(i.status) &&
      (i.status === "failed" || typeof nowMs !== "number" || nowMs - i.createdAt >= BADGE_DELAY_MS)
  ).length;
}

// When the badge next changes on its own (a fresh punch turns 10 s old),
// or null.
function nextBadgeChangeMs(items, companyId, employeeId, nowMs) {
  const times = mine(items, companyId, employeeId)
    .filter((i) => (i.status === "waiting" || i.status === "syncing") && nowMs - i.createdAt < BADGE_DELAY_MS)
    .map((i) => i.createdAt + BADGE_DELAY_MS);
  return times.length ? Math.min(...times) : null;
}

// true = punches are still waiting on the phone (Waiting, Syncing or Failed).
function hasQueueAhead(items, companyId, employeeId) {
  return badgeCount(items, companyId, employeeId) > 0;
}

// "YYYY-MM-DD" of the first day the Sync tab shows: 2 calendar days
// before today in timeZone (undefined = the phone's own zone).
function syncWindowStartKey(nowMs, timeZone) {
  const [y, m, d] = dayKey(nowMs, timeZone).split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d - (SYNC_TAB_DAYS - 1)));
  return start.toISOString().slice(0, 10);
}

// Sync tab rows, newest first: every unsynced row, plus Synced rows made
// today or in the 2 days before (company time zone).
function visibleItems(items, companyId, employeeId, nowMs, timeZone) {
  const startKey = syncWindowStartKey(nowMs, timeZone);
  return mine(items, companyId, employeeId)
    .filter((i) => i.status !== "synced" || dayKey(i.queuedAtMs, timeZone) >= startKey)
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

// Synced rows to drop from the phone (any employee): 4 days after syncing.
function syncedToDrop(items, nowMs) {
  return items.filter((i) => i.status === "synced" && nowMs - (i.syncedAt || 0) >= SYNCED_KEEP_MS).map((i) => i.requestId);
}

// ---- Home ----

// Home status, timers and hours count punches still on the phone, so a
// clock-in made offline shows "Clocked in" right away. Each one becomes an
// event at its own time (Failed ones too, until removed - Home keeps showing
// what the employee did until they remove it). A punch the server already has
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
      // History tags a punch that failed for good "Not synced" (Phase 5).
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

const ACTION_LABELS = { in: "Clock in", out: "Clock out", breakStart: "Break start", breakEnd: "Break end", comment: "Comment" };
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
  PUNCH_TIMEOUT_MS,
  FAST_SYNC_MAX_MS,
  CLOCKS_AGREE_MS,
  BADGE_DELAY_MS,
  QUEUED_MAX_AGE_MS,
  PIN_KEEP_MS,
  SYNCED_KEEP_MS,
  SYNC_TAB_DAYS,
  NOT_RECORDED_MESSAGE,
  COULDNT_SYNC_MESSAGE,
  WILL_SYNC_NOTE,
  failKind,
  isSignalError,
  failMessage,
  rowAction,
  queuedTimeFor,
  isTooOld,
  expectedTimeFrom,
  fastWaitMs,
  withTimeout,
  nextToSend,
  isPaused,
  badgeCount,
  nextBadgeChangeMs,
  hasQueueAhead,
  syncWindowStartKey,
  visibleItems,
  pinsToDelete,
  syncedToDrop,
  foldQueuedEvents,
  newestFirst,
  lastEventMs,
};
