import { getPunchDb, runPunchWrite } from "./punchQueueDb";
import { notifyPunchQueue } from "./punchQueueEvents";
import { siteExitsToDrop } from "./siteExitLogic";

// Employee App Phase 8 - the phone's own leave tracking tables in
// employee_punches.db (see punchQueueDb.js): site_fence (one row per
// tracked shift, its state as JSON) and site_exit_queue (the stretches
// waiting to sync). Same pattern as lib/commentQueue.js. Sending them is
// lib/siteExitQueueSync.js. Also used from the background region task, so
// nothing here touches React.

// ---- site_fence ----

function parseState(row) {
  try {
    return JSON.parse(row.state);
  } catch {
    return null;
  }
}

export async function readFenceState(clockInEventId) {
  if (!clockInEventId) return null;
  const db = await getPunchDb();
  const row = await db.getFirstAsync("SELECT * FROM site_fence WHERE clockInEventId = ?", [clockInEventId]);
  return row ? parseState(row) : null;
}

// Every tracked shift on this phone (any employee) - normally 0 or 1.
export async function listFenceStates() {
  const db = await getPunchDb();
  const rows = await db.getAllAsync("SELECT * FROM site_fence");
  return rows.map(parseState).filter(Boolean);
}

export async function saveFenceState(state) {
  const db = await getPunchDb();
  await runPunchWrite(() =>
    db.runAsync(
      `INSERT INTO site_fence (clockInEventId, companyId, employeeId, state, updatedAt) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(clockInEventId) DO UPDATE SET state = excluded.state, updatedAt = excluded.updatedAt`,
      [state.clockInEventId, state.companyId, state.employeeId, JSON.stringify(state), Date.now()]
    )
  );
}

export async function deleteFenceState(clockInEventId) {
  const db = await getPunchDb();
  await runPunchWrite(() => db.runAsync("DELETE FROM site_fence WHERE clockInEventId = ?", [clockInEventId]));
}

// ---- site_exit_queue ----

function toItem(row) {
  return {
    requestId: row.requestId,
    exitId: row.exitId,
    clockInEventId: row.clockInEventId,
    companyId: row.companyId,
    employeeId: row.employeeId,
    kind: row.kind,
    phase: row.phase,
    atMs: row.atMs,
    notBeforeMs: row.notBeforeMs,
    offReason: row.offReason || null,
    lat: row.lat,
    lng: row.lng,
    accuracyM: row.accuracyM,
    fixAtMs: row.fixAtMs,
    status: row.status,
    failReason: row.failReason || null,
    attempts: row.attempts,
    createdAt: row.createdAt,
    syncedAt: row.syncedAt || null,
  };
}

// row = a "queue" action's row (siteExitLogic.js). A second save of the
// same start/end changes nothing.
export async function enqueueSiteExit(row) {
  const db = await getPunchDb();
  await runPunchWrite(() =>
    db.runAsync(
      `INSERT OR IGNORE INTO site_exit_queue
        (requestId, exitId, clockInEventId, companyId, employeeId, kind, phase, atMs, notBeforeMs, offReason, lat, lng, accuracyM, fixAtMs, status, attempts, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', 0, ?)`,
      [
        `${row.exitId}:${row.phase}`,
        row.exitId,
        row.clockInEventId,
        row.companyId,
        row.employeeId,
        row.kind,
        row.phase,
        Math.round(row.atMs),
        Math.round(row.notBeforeMs),
        row.offReason,
        row.lat,
        row.lng,
        row.accuracyM,
        row.fixAtMs,
        Date.now(),
      ]
    )
  );
  notifyPunchQueue();
}

// F2 a: a "left" cancelled inside its 2 min - only while not yet sent.
export async function unqueueSiteExit(exitId) {
  const db = await getPunchDb();
  await runPunchWrite(() => db.runAsync("DELETE FROM site_exit_queue WHERE exitId = ? AND status = 'waiting'", [exitId]));
  notifyPunchQueue();
}

export async function listSiteExits() {
  const db = await getPunchDb();
  const rows = await db.getAllAsync("SELECT * FROM site_exit_queue");
  return rows.map(toItem);
}

async function update(requestId, sql, params) {
  const db = await getPunchDb();
  await runPunchWrite(() => db.runAsync(`UPDATE site_exit_queue SET ${sql} WHERE requestId = ?`, [...params, requestId]));
  notifyPunchQueue();
}

export function markSiteExitSyncing(requestId) {
  return update(requestId, "status = 'syncing', attempts = attempts + 1", []);
}

export function markSiteExitWaiting(requestId) {
  return update(requestId, "status = 'waiting'", []);
}

export function markSiteExitSynced(requestId) {
  return update(requestId, "status = 'synced', syncedAt = ?, failReason = NULL", [Date.now()]);
}

// Dropped for good (its clock-in failed, or the server refused the call).
export function markSiteExitFailed(requestId, reason) {
  return update(requestId, "status = 'failed', syncedAt = ?, failReason = ?", [Date.now(), reason || null]);
}

// Drops synced / failed rows after 4 days; at startup puts a row left
// "syncing" by a killed app back to waiting.
export async function cleanupSiteExitQueue({ resetSyncing = false } = {}) {
  const items = await listSiteExits();
  const db = await getPunchDb();
  for (const requestId of siteExitsToDrop(items, Date.now())) {
    await runPunchWrite(() => db.runAsync("DELETE FROM site_exit_queue WHERE requestId = ?", [requestId]));
  }
  if (resetSyncing && items.some((i) => i.status === "syncing")) {
    await runPunchWrite(() => db.runAsync("UPDATE site_exit_queue SET status = 'waiting' WHERE status = 'syncing'"));
  }
}
