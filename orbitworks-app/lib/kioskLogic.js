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

module.exports = {
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
  kioskFailKind,
  lockAfterRight,
  lockAfterWrong,
  lockSecondsLeft,
  parsePinTable,
  statusAfter,
  toChunks,
};
