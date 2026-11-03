import * as Crypto from "expo-crypto";
import { getPunchDb, runPunchWrite } from "./punchQueueDb";
import { kickPunchSync, notifyPunchQueue } from "./punchQueueEvents";
import { COMMENT_NOT_SYNCED_MESSAGE, commentsToDrop, newCommentFields } from "./commentQueueLogic";

// Employee App Phase 5 - saving, reading and updating shift comments kept
// on the phone (comment_queue in employee_punches.db). Same pattern as
// lib/punchQueue.js. Sending them is lib/commentQueueSync.js. A comment
// holds no PIN or photo - only its text, its shift and when it was typed.

function toItem(row) {
  return {
    requestId: row.requestId,
    companyId: row.companyId,
    employeeId: row.employeeId,
    clockEventId: row.clockEventId,
    note: row.note,
    madeAtMs: row.madeAtMs,
    createdByName: row.createdByName || "",
    status: row.status,
    failReason: row.failReason || null,
    failMessage: row.failMessage || "",
    attempts: row.attempts,
    createdAt: row.createdAt,
    syncedAt: row.syncedAt || null,
  };
}

// Saves one comment on the employee's shift (clockEventId = the shift's
// clock-in id) and asks the queue to send it. Throws with the shared
// validator's message if the note or shift is missing. Returns its id.
export async function enqueueComment({ companyId, employeeId, clockEventId, note, madeAtMs, createdByName }) {
  if (!companyId || !employeeId) throw new Error("Not signed in");
  const nowMs = Date.now();
  const fields = newCommentFields({ note, clockEventId, madeAtMs }, nowMs);
  const requestId = Crypto.randomUUID();
  const db = await getPunchDb();
  await runPunchWrite(() =>
    db.runAsync(
      `INSERT INTO comment_queue
        (requestId, companyId, employeeId, clockEventId, note, madeAtMs, createdByName, status, attempts, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', 0, ?)`,
      [requestId, companyId, employeeId, fields.clockEventId, fields.note, fields.madeAtMs, createdByName || "", nowMs]
    )
  );
  notifyPunchQueue();
  kickPunchSync();
  return requestId;
}

export async function listAllComments() {
  const db = await getPunchDb();
  const rows = await db.getAllAsync("SELECT * FROM comment_queue");
  return rows.map(toItem);
}

async function update(requestId, sql, params) {
  const db = await getPunchDb();
  await runPunchWrite(() => db.runAsync(`UPDATE comment_queue SET ${sql} WHERE requestId = ?`, [...params, requestId]));
  notifyPunchQueue();
}

export function markCommentSyncing(requestId) {
  return update(requestId, "status = 'syncing', attempts = attempts + 1", []);
}

// Back to Waiting after a signal problem (sent again later).
export function markCommentWaiting(requestId) {
  return update(requestId, "status = 'waiting'", []);
}

// Synced: the row stays 4 days (Sync tab), then cleanup drops it.
export function markCommentSynced(requestId) {
  return update(requestId, "status = 'synced', syncedAt = ?, failReason = NULL, failMessage = NULL", [Date.now()]);
}

// Not synced, for good. reason: clockInFailed | clockInMissing | refused | invalid.
export function markCommentFailed(requestId, reason) {
  return update(requestId, "status = 'failed', failReason = ?, failMessage = ?", [reason || null, COMMENT_NOT_SYNCED_MESSAGE]);
}

// Remove (a Not synced row only, after the employee confirms).
export async function removeComment(requestId) {
  const db = await getPunchDb();
  await runPunchWrite(() => db.runAsync("DELETE FROM comment_queue WHERE requestId = ? AND status = 'failed'", [requestId]));
  notifyPunchQueue();
}

// Housekeeping for every employee on this phone: drops synced comments
// after 4 days, and (startup only) puts a comment left "Syncing" by a
// killed app back to Waiting.
export async function cleanupCommentQueue({ resetSyncing = false } = {}) {
  const items = await listAllComments();
  const db = await getPunchDb();
  let changed = false;
  const drop = commentsToDrop(items, Date.now());
  for (const requestId of drop) {
    await runPunchWrite(() => db.runAsync("DELETE FROM comment_queue WHERE requestId = ?", [requestId]));
    changed = true;
  }
  if (resetSyncing && items.some((i) => i.status === "syncing")) {
    await runPunchWrite(() => db.runAsync("UPDATE comment_queue SET status = 'waiting' WHERE status = 'syncing'"));
    changed = true;
  }
  if (changed) notifyPunchQueue();
}
