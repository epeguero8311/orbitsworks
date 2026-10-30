import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { getPunchDb, runPunchWrite } from "./punchQueueDb";
import { kickPunchSync, notifyPunchQueue } from "./punchQueueEvents";
import { pinsToDelete, syncedToDrop } from "./punchQueueLogic";

// Employee App Phase 4 - saving, reading and updating punches kept on the
// phone (offline, or slow signal). Sending them is lib/punchQueueSync.js.
//
// The typed PIN of a saved clock in/out goes ONLY into SecureStore (the
// phone's keychain), under the punch's own key. It is deleted when the
// punch syncs or fails, or after 24 h - whichever comes first. Never in
// SQLite, never logged. The photo is copied out of the camera's cache into
// the app's own folder so the phone can't clean it up before it's sent.

const PHOTO_DIR = `${FileSystem.documentDirectory}punch-queue/`;
const SECURE_OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function pinKey(requestId) {
  return `punchPin_${requestId}`;
}

function lastSyncedKey(companyId, employeeId) {
  return `lastSynced:${companyId}:${employeeId}`;
}

function toItem(row) {
  return {
    requestId: row.requestId,
    companyId: row.companyId,
    employeeId: row.employeeId,
    action: row.action,
    queuedAtMs: row.queuedAtMs,
    siteName: row.siteName || "",
    photoLocalUri: row.photoLocalUri || null,
    photoUploaded: row.photoUploaded === 1,
    hasPin: row.hasPin === 1,
    status: row.status,
    failKind: row.failKind || null,
    failReason: row.failReason || null,
    failMessage: row.failMessage || "",
    attempts: row.attempts,
    createdAt: row.createdAt,
    syncedAt: row.syncedAt || null,
  };
}

async function deleteFile(uri) {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Already gone - nothing to clean up.
  }
}

async function deletePin(requestId) {
  try {
    await SecureStore.deleteItemAsync(pinKey(requestId));
  } catch {
    // Not there - fine.
  }
}

async function keepPhoto(requestId, uri) {
  await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => {});
  const dest = `${PHOTO_DIR}${requestId}.jpg`;
  if (uri === dest) return dest;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

// Saves one punch. pin / photoUri only for clock in/out.
export async function enqueuePunch({ companyId, employeeId, action, requestId, queuedAtMs, siteName, pin, photoUri, photoUploaded }) {
  const photoLocalUri = photoUri ? await keepPhoto(requestId, photoUri) : null;
  if (pin) await SecureStore.setItemAsync(pinKey(requestId), pin, SECURE_OPTS);
  const db = await getPunchDb();
  await runPunchWrite(() =>
    db.runAsync(
      `INSERT OR REPLACE INTO punch_queue
        (requestId, companyId, employeeId, action, queuedAtMs, siteName, photoLocalUri, photoUploaded, hasPin, status, attempts, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', 0, ?)`,
      [requestId, companyId, employeeId, action, queuedAtMs, siteName || "", photoLocalUri, photoUploaded ? 1 : 0, pin ? 1 : 0, Date.now()]
    )
  );
  notifyPunchQueue();
  kickPunchSync();
}

export async function listAllPunches() {
  const db = await getPunchDb();
  const rows = await db.getAllAsync("SELECT * FROM punch_queue");
  return rows.map(toItem);
}

export async function getPunch(requestId) {
  const db = await getPunchDb();
  const row = await db.getFirstAsync("SELECT * FROM punch_queue WHERE requestId = ?", [requestId]);
  return row ? toItem(row) : null;
}

// null = no PIN saved. Throws if the keychain can't be read right now
// (e.g. phone locked) - the sync then leaves the punch Waiting.
export function getSavedPin(requestId) {
  return SecureStore.getItemAsync(pinKey(requestId));
}

async function update(requestId, sql, params) {
  const db = await getPunchDb();
  await runPunchWrite(() => db.runAsync(`UPDATE punch_queue SET ${sql} WHERE requestId = ?`, [...params, requestId]));
  notifyPunchQueue();
}

export function markSyncing(requestId) {
  return update(requestId, "status = 'syncing', attempts = attempts + 1", []);
}

export function markPhotoUploaded(requestId) {
  return update(requestId, "photoUploaded = 1", []);
}

// Back to Waiting after a signal problem (sent again later).
export function markWaiting(requestId) {
  return update(requestId, "status = 'waiting'", []);
}

// Synced: the PIN and the local photo are deleted, the row stays 24 h.
export async function markSynced(requestId, siteName) {
  const item = await getPunch(requestId);
  await deletePin(requestId);
  await update(requestId, "status = 'synced', syncedAt = ?, hasPin = 0, photoLocalUri = NULL, siteName = COALESCE(?, siteName)", [
    Date.now(),
    siteName || null,
  ]);
  if (item) await deleteFile(item.photoLocalUri);
}

// Failed for good: the PIN is deleted (Redo asks for it again), the photo
// is kept for Redo until the row is removed.
export async function markFailed(requestId, kind, reason, message) {
  await deletePin(requestId);
  await update(requestId, "status = 'failed', failKind = ?, failReason = ?, failMessage = ?, hasPin = 0, photoUploaded = 0", [
    kind,
    reason || null,
    message || "",
  ]);
}

// Redo after a wrong PIN: the new PIN (already checked online) is saved and
// the same punch - same time, same photo - goes back in line.
export async function redoPunch(requestId, pin) {
  if (pin) await SecureStore.setItemAsync(pinKey(requestId), pin, SECURE_OPTS);
  await update(requestId, "status = 'waiting', failKind = NULL, failReason = NULL, failMessage = NULL, hasPin = ?, photoUploaded = 0", [
    pin ? 1 : 0,
  ]);
}

// Remove (a Failed row only, after the employee confirms): the punch is
// never recorded. Deletes the row, the PIN and the photo.
export async function removePunch(requestId) {
  const item = await getPunch(requestId);
  await deletePin(requestId);
  const db = await getPunchDb();
  await runPunchWrite(() => db.runAsync("DELETE FROM punch_queue WHERE requestId = ? AND status = 'failed'", [requestId]));
  if (item && item.status === "failed") await deleteFile(item.photoLocalUri);
  notifyPunchQueue();
}

// Housekeeping for every employee on this phone (signed in or not):
// deletes PINs that are 24 h old or no longer needed, drops synced rows
// after 24 h, and (startup only) puts a punch left "Syncing" by a killed
// app back to Waiting.
export async function cleanupPunchQueue({ resetSyncing = false } = {}) {
  const now = Date.now();
  const items = await listAllPunches();
  const db = await getPunchDb();
  let changed = false;

  for (const requestId of pinsToDelete(items, now)) {
    await deletePin(requestId);
    await runPunchWrite(() => db.runAsync("UPDATE punch_queue SET hasPin = 0 WHERE requestId = ?", [requestId]));
    changed = true;
  }
  for (const requestId of syncedToDrop(items, now)) {
    const item = items.find((i) => i.requestId === requestId);
    await runPunchWrite(() => db.runAsync("DELETE FROM punch_queue WHERE requestId = ?", [requestId]));
    if (item) await deleteFile(item.photoLocalUri);
    changed = true;
  }
  if (resetSyncing && items.some((i) => i.status === "syncing")) {
    await runPunchWrite(() => db.runAsync("UPDATE punch_queue SET status = 'waiting' WHERE status = 'syncing'"));
    changed = true;
  }
  if (changed) notifyPunchQueue();
}

// "Last synced": the time the server last accepted a punch from this
// employee on this phone, sent online or from the queue.
export async function getLastSynced(companyId, employeeId) {
  const db = await getPunchDb();
  const row = await db.getFirstAsync("SELECT value FROM punch_meta WHERE key = ?", [lastSyncedKey(companyId, employeeId)]);
  const ms = row ? Number(row.value) : 0;
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export async function setLastSynced(companyId, employeeId, ms) {
  if (!companyId || !employeeId) return;
  const db = await getPunchDb();
  await runPunchWrite(() =>
    db.runAsync("INSERT OR REPLACE INTO punch_meta (key, value) VALUES (?, ?)", [lastSyncedKey(companyId, employeeId), String(ms)])
  );
  notifyPunchQueue();
}

export async function photoExists(uri) {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}
