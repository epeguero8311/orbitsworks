// Employee App Phase 8 - leaving the job site: every rule the phone uses,
// with no React Native, Expo or Firebase imports so
// test/siteExitLogic.test.js runs it under `node --test` (same pattern as
// commentQueueLogic.js). The Expo side is lib/siteTracking.js; the server
// re-checks everything (functions/src/employeeSiteExits.ts).
//
// FLAG ONLY: nothing here can block, change or end a punch.
//
// One tracked shift = one site_fence row (state below). Region-only (D7):
// the OS wakes the app for a region enter / exit, the phone takes one fresh
// fix, and these functions turn that into queue rows and notifications.
//
// The 2-minute rule (approved design, F2 a):
//   - exit + a good fix outside (after being inside once, D9): the "left"
//     start is queued at the exit time with notBeforeMs = exit + 2 min, and
//     the "You have left the job site" notification is scheduled for the
//     same time. The phone never has to wake at 2 min: the OS shows the
//     notification, and the queue only sends the row once 2 min passed.
//   - an OS enter within those 2 min cancels both (trusted even with a
//     rough fix). Nothing is recorded.
//   - an enter after 2 min with a good fix inside queues the return.
//   - exit with no good fix (E4): a gray "tracking off" gap (noFix) starts;
//     the next good fix ends it (and starts the exit if it is outside).
// Exits under 3 min still record (F1 b) - the website shows them gray
// "short" (SHORT_EXIT_MS).
//
// state: {
//   clockInEventId, companyId, employeeId, siteName,
//   fence: { lat, lng, radiusM } | null, fenceSource: "cached" | "server",
//   status: "tracking" | "stopped",
//   seenInside: boolean,
//   openExit: { id, atMs } | null,      // a "left" not yet ended
//   openOff: { id, atMs, reason } | null, // a "tracking off" not yet ended
//   lastAliveMs: number
// }
// actions: { type: "queue", row } | { type: "unqueue", exitId }
//        | { type: "notify", exitId, atMs, siteName } | { type: "cancelNotify", exitId }

const { fenceSide, SITE_EXIT_DWELL_MS, EXIT_MAX_ACCURACY_M } = require("./validators/siteExit");
const { SYNCED_KEEP_MS } = require("./punchQueueLogic");
const { commentGate } = require("./commentQueueLogic");

// F1 b: a "left" that ended (returned) within this is shown gray "short".
const SHORT_EXIT_MS = 3 * 60 * 1000;

function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// A fix good enough to decide anything (D6: 100 m or better).
function fixIsGood(fix) {
  return !!fix && isNum(fix.lat) && isNum(fix.lng) && isNum(fix.accuracyM) && fix.accuracyM >= 0 && fix.accuracyM <= EXIT_MAX_ACCURACY_M;
}

function fixFields(fix) {
  return fix && isNum(fix.lat) && isNum(fix.lng)
    ? { lat: fix.lat, lng: fix.lng, accuracyM: isNum(fix.accuracyM) ? fix.accuracyM : null, fixAtMs: isNum(fix.fixAtMs) ? fix.fixAtMs : null }
    : { lat: null, lng: null, accuracyM: null, fixAtMs: null };
}

function queueRow(state, { exitId, kind, phase, atMs, notBeforeMs, fix, offReason }) {
  return {
    exitId,
    clockInEventId: state.clockInEventId,
    companyId: state.companyId,
    employeeId: state.employeeId,
    kind,
    phase,
    atMs,
    notBeforeMs: notBeforeMs ?? atMs,
    offReason: offReason || null,
    ...fixFields(kind === "left" ? fix : null),
  };
}

// The pending (not yet 2 min old) "left", if any.
function isPending(state, nowMs) {
  return !!state.openExit && nowMs - state.openExit.atMs < SITE_EXIT_DWELL_MS;
}

function openExit(state, atMs, fix, newId) {
  const id = newId();
  return {
    state: { ...state, openExit: { id, atMs } },
    actions: [
      { type: "queue", row: queueRow(state, { exitId: id, kind: "left", phase: "start", atMs, notBeforeMs: atMs + SITE_EXIT_DWELL_MS, fix }) },
      { type: "notify", exitId: id, atMs: atMs + SITE_EXIT_DWELL_MS, siteName: state.siteName },
    ],
  };
}

function cancelPendingExit(state) {
  const id = state.openExit.id;
  return { state: { ...state, openExit: null }, actions: [{ type: "unqueue", exitId: id }, { type: "cancelNotify", exitId: id }] };
}

function endExit(state, atMs, fix) {
  const id = state.openExit.id;
  return {
    state: { ...state, openExit: null },
    actions: [{ type: "queue", row: queueRow(state, { exitId: id, kind: "left", phase: "end", atMs, fix }) }],
  };
}

function openOffGap(state, atMs, reason, newId) {
  if (state.openOff) return { state, actions: [] };
  const id = newId();
  return {
    state: { ...state, openOff: { id, atMs, reason } },
    actions: [{ type: "queue", row: queueRow(state, { exitId: id, kind: "trackingOff", phase: "start", atMs, offReason: reason }) }],
  };
}

function closeOffGap(state, atMs) {
  if (!state.openOff) return { state, actions: [] };
  const id = state.openOff.id;
  const endMs = Math.max(atMs, state.openOff.atMs);
  return {
    state: { ...state, openOff: null },
    actions: [{ type: "queue", row: queueRow(state, { exitId: id, kind: "trackingOff", phase: "end", atMs: endMs }) }],
  };
}

function chain(first, nextFn) {
  const second = nextFn(first.state);
  return { state: second.state, actions: [...first.actions, ...second.actions] };
}

// ---- start / stop ----

// A new tracked shift. canTrack = location consent + Always location. Not
// able to track (E2) = the whole shift starts as a gray "tracking off".
function startState({ clockInEventId, companyId, employeeId, siteName, fence, fenceSource, clockInFix, clockInMs, canTrack, newId }) {
  const state = {
    clockInEventId,
    companyId,
    employeeId,
    siteName: siteName || "",
    fence: fence || null,
    fenceSource: fenceSource || "cached",
    status: "tracking",
    // D9: the clock-in fix itself counts as "been inside" when it is.
    seenInside: fenceSide(clockInFix, fence) === "inside",
    openExit: null,
    openOff: null,
    lastAliveMs: clockInMs,
  };
  if (canTrack) return { state, actions: [] };
  return openOffGap(state, clockInMs, "permission", newId);
}

// Clock-out seen (or the server says the shift is no longer tracked). A
// "left" still inside its 2 min is dropped; anything else open is ended by
// the server at the clock-out (closeOpenSiteExits).
function stop(state, { nowMs }) {
  let out = { state, actions: [] };
  if (isPending(state, nowMs)) out = cancelPendingExit(state);
  return { state: { ...out.state, status: "stopped" }, actions: out.actions };
}

// ---- what the OS / a fix says ----

// One good fix, from a region event or the app coming to the front.
function applyGoodFix(state, fix, nowMs, newId) {
  const side = fenceSide(fix, state.fence);
  // A good fix ends a "no fix" gap whatever it says.
  let out = state.openOff && state.openOff.reason === "noFix" ? closeOffGap(state, nowMs) : { state, actions: [] };
  if (side === "inside") {
    out = { state: { ...out.state, seenInside: true }, actions: out.actions };
    if (out.state.openExit) {
      return chain(out, (s) => (isPending(s, nowMs) ? cancelPendingExit(s) : endExit(s, nowMs, fix)));
    }
    return out;
  }
  if (side === "outside" && out.state.seenInside && !out.state.openExit) {
    return chain(out, (s) => openExit(s, nowMs, fix, newId));
  }
  return out;
}

// kind: "enter" | "exit". fix: the one fresh fix (or null).
function regionEvent(state, { kind, fix, nowMs, newId }) {
  if (state.status !== "tracking" || !state.fence) return { state, actions: [] };
  const alive = { ...state, lastAliveMs: nowMs };
  if (kind === "enter") {
    // F2 a: an enter inside the 2 min cancels the pending exit, fix or not.
    if (isPending(alive, nowMs)) {
      const cancelled = cancelPendingExit(alive);
      return { state: { ...cancelled.state, seenInside: true }, actions: cancelled.actions };
    }
    return fixIsGood(fix) ? applyGoodFix(alive, fix, nowMs, newId) : { state: alive, actions: [] };
  }
  // exit
  if (fixIsGood(fix)) return applyGoodFix(alive, fix, nowMs, newId);
  // E4: no good fix - a gap, so a real exit is never silently lost. Only
  // once they've been inside (D9) and nothing else is already open.
  if (alive.seenInside && !alive.openExit) return openOffGap(alive, nowMs, "noFix", newId);
  return { state: alive, actions: [] };
}

// The app came to the front mid-shift and took a fix (never a region event).
function foregroundFix(state, { fix, nowMs, newId }) {
  if (state.status !== "tracking" || !state.fence) return { state, actions: [] };
  const alive = { ...state, lastAliveMs: nowMs };
  return fixIsGood(fix) ? applyGoodFix(alive, fix, nowMs, newId) : { state: alive, actions: [] };
}

// Tracking lost (Always lowered or off, signed out, geofence gone) /
// tracking back.
function trackingOff(state, { reason, atMs, newId }) {
  if (state.status !== "tracking") return { state, actions: [] };
  if (state.openOff && state.openOff.reason !== reason && state.openOff.reason === "noFix") {
    // A stronger reason replaces a "no fix" gap: end it and start the new one.
    return chain(closeOffGap(state, atMs), (s) => openOffGap(s, atMs, reason, newId));
  }
  return openOffGap(state, atMs, reason, newId);
}

function trackingOn(state, { atMs }) {
  if (!state.openOff || state.openOff.reason === "noFix") return { state, actions: [] };
  return closeOffGap(state, atMs);
}

// When an "appStopped" gap started: the later of the last time the phone
// was known to be tracking and the phone's boot (now - uptime), when known.
function appStoppedGapStart({ lastAliveMs, nowMs, uptimeMs }) {
  const boot = isNum(uptimeMs) && uptimeMs >= 0 ? nowMs - uptimeMs : null;
  const alive = isNum(lastAliveMs) ? lastAliveMs : nowMs;
  return Math.min(nowMs, boot !== null ? Math.max(alive, boot) : alive);
}

// ---- the queue ----

// status: "waiting" | "syncing" | "synced" | "failed" (failed = dropped for good)
function mine(rows, companyId, employeeId) {
  return rows.filter((r) => r.companyId === companyId && r.employeeId === employeeId);
}

// This employee's rows that can be sent now, oldest first, starts before
// ends: [{ row, gate: "send" | "fail" }]. A start waits for its 2 min
// (notBeforeMs); an end waits while its start is still on the phone; every
// row waits while its clock-in punch is still on the phone (same gate as
// shift comments). A clock-in that failed for good fails its rows.
function siteExitsToSend(rows, punches, companyId, employeeId, nowMs) {
  const list = mine(rows, companyId, employeeId);
  const startWaiting = new Set(list.filter((r) => r.phase === "start" && (r.status === "waiting" || r.status === "syncing")).map((r) => r.exitId));
  return list
    .filter((r) => r.status === "waiting" && r.notBeforeMs <= nowMs)
    .filter((r) => r.phase === "start" || !startWaiting.has(r.exitId))
    .sort((a, b) => a.atMs - b.atMs || (a.phase === "start" ? -1 : 1))
    .map((row) => ({ row, gate: commentGate({ clockEventId: row.clockInEventId }, punches) }))
    .filter((x) => x.gate !== "wait");
}

// Synced / failed rows are dropped after the same 4 days as punches.
function siteExitsToDrop(rows, nowMs) {
  return rows
    .filter((r) => (r.status === "synced" || r.status === "failed") && nowMs - (r.syncedAt || r.createdAt || 0) > SYNCED_KEEP_MS)
    .map((r) => r.requestId);
}

// Waiting + syncing for this employee (the log out warning counts them).
function pendingSiteExitCount(rows, companyId, employeeId) {
  return mine(rows, companyId, employeeId).filter((r) => r.status === "waiting" || r.status === "syncing").length;
}

// True when this shift's clock-in was made on this phone (D11: only those
// are tracked) - its punch is (or was, for 4 days) in the punch queue.
function madeOnThisPhone(clockInEventId, punches) {
  return !!clockInEventId && punches.some((p) => p.requestId === clockInEventId && p.action === "in");
}

// Text of the local notification (D4).
function exitNotification(siteName) {
  return {
    title: "You have left the job site",
    body: `You left ${siteName || "the job site"}. It is noted on your shift - you are still clocked in.`,
  };
}

module.exports = {
  SHORT_EXIT_MS,
  fixIsGood,
  isPending,
  startState,
  stop,
  regionEvent,
  foregroundFix,
  trackingOff,
  trackingOn,
  appStoppedGapStart,
  siteExitsToSend,
  siteExitsToDrop,
  pendingSiteExitCount,
  madeOnThisPhone,
  exitNotification,
};
