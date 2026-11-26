// Task 5 Kiosk mode - pure rules (no React Native / Expo / Firebase imports)
// so test/kioskLogic.test.js runs them under `node --test`. The I/O is in
// lib/kioskPinStore.js, lib/kioskLock.js, lib/kioskQueue.js and
// lib/kioskQueueSync.js.

// K14: 3 wrong PINs in a row = the whole tablet waits 45 s (on-screen
// countdown). Saved, so restarting the app doesn't reset it.
const KIOSK_MAX_WRONG = 3;
const KIOSK_LOCK_MS = 45 * 1000;

// SecureStore: some iOS releases refused values over ~2048 bytes (Expo SDK 57
// docs), so the PIN table is saved in chunks below that.
const SECURE_CHUNK_CHARS = 1800;

const PIN_TABLE_VERSION = 1;
const HEX64 = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

// hash = sha256_hex(salt + ":" + pin) - same string as the server
// (functions/src/lib/pinVerifier.ts pinVerifierHash).
function hashInput(salt, pin) {
  return `${salt}:${pin}`;
}

// getKioskPinTable's answer -> the table the tablet keeps, or null when it
// doesn't look right (an old/odd answer is never half-used).
function parsePinTable(data) {
  if (!data || typeof data !== "object" || data.v !== PIN_TABLE_VERSION) return null;
  if (typeof data.salt !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(data.salt)) return null;
  if (!Array.isArray(data.employees) || !Array.isArray(data.unlockers) || !Array.isArray(data.sites)) return null;
  const employees = [];
  for (const e of data.employees) {
    if (!e || !ID.test(e.id) || !HEX64.test(e.hash)) continue;
    employees.push({
      id: e.id,
      name: typeof e.name === "string" ? e.name : "",
      hash: e.hash,
      assignedSiteIds: Array.isArray(e.assignedSiteIds) ? e.assignedSiteIds.filter((s) => typeof s === "string") : [],
      lastEventType: typeof e.lastEventType === "string" ? e.lastEventType : null,
      lastEventTimestamp: Number.isFinite(e.lastEventTimestamp) ? e.lastEventTimestamp : null,
    });
  }
  const unlockers = data.unlockers
    .filter((u) => u && ID.test(u.id) && HEX64.test(u.hash))
    .map((u) => ({ id: u.id, name: typeof u.name === "string" ? u.name : "", hash: u.hash }));
  return {
    v: PIN_TABLE_VERSION,
    salt: data.salt,
    isPro: data.isPro === true,
    kioskName: typeof data.kioskName === "string" ? data.kioskName : "",
    employees,
    unlockers,
    sites: data.sites.filter((s) => s && ID.test(s.id)),
    hasLocatedSites: data.hasLocatedSites === true,
    // Task 5 v2 (3): website Mobile App Settings -> Kiosk.
    createAccount: data.createAccount === true,
    requireAdminPin: data.createAccount === true && data.requireAdminPin === true,
    syncedAtMs: Number.isFinite(data.serverNowMs) ? data.serverNowMs : null,
  };
}

// The employee whose PIN hashes to `hash` (null = PIN not recognized). Two
// matches can't happen (PINs are unique per company, K5 / pins index) - if
// the table ever had two, nobody is picked rather than the wrong person.
function findEmployeeByHash(table, hash) {
  if (!table || !hash) return null;
  const hits = table.employees.filter((e) => e.hash === hash);
  return hits.length === 1 ? hits[0] : null;
}

// K17: an admin whose own PIN opens Kiosk Settings (works offline).
function findUnlockerByHash(table, hash) {
  if (!table || !hash) return null;
  return table.unlockers.find((u) => u.hash === hash) || null;
}

// ---- wrong-PIN lock (K14) ----
// state = { count, lockedUntilMs } (missing = no wrong PINs yet)

function lockSecondsLeft(state, nowMs) {
  const until = state && Number.isFinite(state.lockedUntilMs) ? state.lockedUntilMs : 0;
  return until > nowMs ? Math.ceil((until - nowMs) / 1000) : 0;
}

// After a wrong PIN: the 3rd in a row starts the 45 s wait and the count
// starts over. A finished wait also starts a fresh count.
function lockAfterWrong(state, nowMs) {
  const stillLocked = lockSecondsLeft(state, nowMs) > 0;
  if (stillLocked) return state;
  const count = (state && Number.isFinite(state.count) ? state.count : 0) + 1;
  if (count >= KIOSK_MAX_WRONG) return { count: 0, lockedUntilMs: nowMs + KIOSK_LOCK_MS };
  return { count, lockedUntilMs: 0 };
}

// A right PIN clears the count (a running wait is never shortened - the
// pad is disabled then anyway).
function lockAfterRight(state, nowMs) {
  if (lockSecondsLeft(state, nowMs) > 0) return state;
  return { count: 0, lockedUntilMs: 0 };
}

// ---- where an employee stands right now ----
// From the server's last event (pin table) and this tablet's own punches
// not yet confirmed: whichever is newer wins. Failed punches never count.
// -> { status: "in" | "break" | "out", sinceMs }
function statusAfter(type) {
  if (type === "in" || type === "breakEnd") return "in";
  if (type === "breakStart") return "break";
  return "out";
}

function currentStatus(employee, queuedItems) {
  let type = employee ? employee.lastEventType : null;
  let at = employee && Number.isFinite(employee.lastEventTimestamp) ? employee.lastEventTimestamp : 0;
  for (const item of queuedItems || []) {
    if (!employee || item.employeeId !== employee.id || item.status === "failed") continue;
    if (item.queuedAtMs >= at) {
      type = item.action;
      at = item.queuedAtMs;
    }
  }
  return { status: statusAfter(type), sinceMs: at || null };
}

// The buttons after a PIN. A break while clocked out is shown but blocked
// with "Please clock in first" (spec); clocking out on a break is blocked
// with "End your break first".
function kioskActions(status) {
  if (status === "break") return { clock: "out", clockBlocked: "End your break first.", breakAction: "breakEnd", breakBlocked: null };
  if (status === "in") return { clock: "out", clockBlocked: null, breakAction: "breakStart", breakBlocked: null };
  return { clock: "in", clockBlocked: null, breakAction: "breakStart", breakBlocked: "Please clock in first." };
}

// ---- the kiosk Break screen (cleanup 2026-11-26) ----
// [Break] on the Action screen only opens this screen. What it shows:
// "start" = [Start break] [Back]; "onBreak" = the timer + [End break]
// [Back]; "notIn" = "Please clock in first." + [Back] (the status changed
// under us). startedHereMs = the break this screen just started (shown at
// once, before the queued punch shows up in the status).
function kioskBreakView(status, sinceMs, startedHereMs) {
  if (Number.isFinite(startedHereMs)) return { mode: "onBreak", sinceMs: startedHereMs };
  if (status === "break") return { mode: "onBreak", sinceMs: Number.isFinite(sinceMs) ? sinceMs : null };
  if (status === "in") return { mode: "start", sinceMs: null };
  return { mode: "notIn", sinceMs: null };
}

// ---- what a queued punch keeps instead of the PIN (final audit A) ----
// New punches keep JSON { salt, hash }. A punch queued by an older build
// (dev 34/35) kept the 4 typed digits - still sent as { pin } so it isn't
// lost. Anything else = null (the punch can't be sent).
function serializePinProof(proof) {
  return JSON.stringify({ salt: proof.salt, hash: proof.hash });
}

function storedPinPayload(raw) {
  if (typeof raw !== "string" || !raw) return null;
  if (/^\d{4}$/.test(raw)) return { pin: raw };
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.salt === "string" && p.salt && typeof p.hash === "string" && /^[0-9a-f]{64}$/i.test(p.hash)) {
      return { pinProof: { salt: p.salt, hash: p.hash } };
    }
  } catch {
    // not JSON
  }
  return null;
}

// ---- SecureStore chunks ----
function toChunks(text, size = SECURE_CHUNK_CHARS) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [""];
}

// ---- sync outcome of one queued kiosk punch ----
// "retry"  = signal/server trouble, try again later (stop this run)
// "wait"   = the kiosk is locked server-side for a moment (stop this run)
// "failed" = the server refused it for good (shown in Kiosk Settings)
const PERMANENT_REASONS = ["wrongPin", "inactive", "wrongAccount", "invalid", "notPro", "notKiosk", "syncBlocked", "badTime", "photo", "kioskOff"];

function kioskFailKind(err) {
  const reason = err && err.details && err.details.reason;
  if (reason === "locked") return "wait";
  if (PERMANENT_REASONS.includes(reason)) return "failed";
  return "retry";
}

// Storage refused the photo upload because the file is already there (a
// retry after the upload landed) - go on to the punch call.
function isAlreadyUploaded(err) {
  const message = err && typeof err.message === "string" ? err.message : "";
  return /status 403\b/.test(message);
}

// ---- break timer on the after-PIN screen (iPad round 1, item 3) ----
// Whole minutes since the break started: "0 min", "18 min", "1 h 05 min".
function breakElapsedText(sinceMs, nowMs) {
  if (!Number.isFinite(sinceMs) || !Number.isFinite(nowMs)) return "";
  const mins = Math.max(0, Math.floor((nowMs - sinceMs) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;
}

// "Break started 12:05 PM - 18 min". timeText(ms) formats the clock time
// (the screen passes toLocaleTimeString; tests pass a fixed one).
function breakStartedLine(sinceMs, nowMs, timeText) {
  if (!Number.isFinite(sinceMs)) return "";
  return `Break started ${timeText(sinceMs)} - ${breakElapsedText(sinceMs, nowMs)}`;
}

// ---- comment on a kiosk clock in/out (iPad round 1, item 1) ----
// Same limits as the supervisor app's camera comment (validators/
// employeeComment.js, firestore.rules isValidEmployeeComment): trimmed,
// 1-500 chars, clock in/out only. null = send no comment.
const KIOSK_COMMENT_MAX = 500;
function kioskCommentFor(action, text) {
  if (action !== "in" && action !== "out") return null;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, KIOSK_COMMENT_MAX) : null;
}

// ---- Kiosk Settings "Waiting to sync" list (iPad round 1, item 4) ----
// Read-only. Every punch not yet on the server (waiting / sending) plus the
// ones the server refused in the last FAILED_SHOWN_MS (with the reason),
// oldest first. Synced punches never show.
const FAILED_SHOWN_MS = 7 * 24 * 60 * 60 * 1000;
const ACTION_TEXT = { in: "Clock in", out: "Clock out", breakStart: "Break start", breakEnd: "Break end" };
const STATUS_TEXT = { waiting: "Waiting", syncing: "Sending", failed: "Failed" };

function kioskSyncRows(items, nowMs) {
  return (items || [])
    .filter((i) => i && (i.status === "waiting" || i.status === "syncing" || (i.status === "failed" && nowMs - i.queuedAtMs <= FAILED_SHOWN_MS)))
    .sort((a, b) => a.queuedAtMs - b.queuedAtMs)
    .map((i) => ({
      requestId: i.requestId,
      employeeName: i.employeeName || "Employee",
      actionText: ACTION_TEXT[i.action] || i.action,
      queuedAtMs: i.queuedAtMs,
      status: i.status,
      statusText: STATUS_TEXT[i.status],
      reason: i.status === "failed" ? i.failMessage || "Not recorded. Tell your admin." : "",
    }));
}

// "just now", "5 min ago", "2 h ago", "3 days ago"; "never" without a time.
function agoText(ms, nowMs) {
  if (!Number.isFinite(ms) || ms <= 0) return "never";
  const mins = Math.floor(Math.max(0, nowMs - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

module.exports = {
  FAILED_SHOWN_MS,
  KIOSK_COMMENT_MAX,
  agoText,
  breakElapsedText,
  breakStartedLine,
  kioskCommentFor,
  kioskSyncRows,
  KIOSK_LOCK_MS,
  KIOSK_MAX_WRONG,
  PIN_TABLE_VERSION,
  SECURE_CHUNK_CHARS,
  currentStatus,
  findEmployeeByHash,
  findUnlockerByHash,
  hashInput,
  isAlreadyUploaded,
  kioskActions,
  serializePinProof,
  storedPinPayload,
  kioskBreakView,
  kioskFailKind,
  lockAfterRight,
  lockAfterWrong,
  lockSecondsLeft,
  parsePinTable,
  statusAfter,
  toChunks,
};
