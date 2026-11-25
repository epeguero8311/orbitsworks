import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";

// Task 5 Kiosk mode - punches made on the iPad, kept until the server has
// them. Like the supervisor app, EVERY kiosk punch is saved here first and
// sent right after (lib/kioskQueueSync.js), so a punch is never blocked by
// signal. Its own file (kiosk_punches.db) - the supervisor queue
// (orbitworks.db) and the Employee App queue (employee_punches.db) are never
// touched.
//
// The typed PIN of a saved punch goes ONLY into SecureStore under the
// punch's own key and is deleted when it is sent or refused for good.
// Never in SQLite, never logged. The photo is copied into the app's own
// folder so iOS can't clean it up first.
//
// kiosk_queue.status: waiting | syncing | synced | failed

const PHOTO_DIR = `${FileSystem.documentDirectory}kiosk-queue/`;
const SECURE_OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const pinKey = (requestId) => `kioskPin_${requestId}`;
const SYNCED_KEEP_MS = 24 * 60 * 60 * 1000;

let dbPromise = null;
let writeChain = Promise.resolve();
const listeners = new Set();

function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("kiosk_punches.db");
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS kiosk_queue (
          requestId TEXT PRIMARY KEY,
          companyId TEXT NOT NULL,
          kioskUid TEXT NOT NULL,
          employeeId TEXT NOT NULL,
          employeeName TEXT,
          action TEXT NOT NULL,
          queuedAtMs INTEGER NOT NULL,
          photoLocalUri TEXT,
          photoUploaded INTEGER NOT NULL DEFAULT 0,
          locationJson TEXT,
          uptimeAtMs INTEGER,
          expectedAtMs INTEGER,
          lastServerMs INTEGER,
          sessionId TEXT,
          status TEXT NOT NULL DEFAULT 'waiting',
          failMessage TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          createdAt INTEGER NOT NULL,
          syncedAt INTEGER
        );
        CREATE TABLE IF NOT EXISTS kiosk_meta (key TEXT PRIMARY KEY, value TEXT);
      `);
      return db;
    })().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function runWrite(fn) {
  const run = writeChain.then(() => fn());
  writeChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // ignore
    }
  }
}

export function subscribeKioskQueue(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function toItem(row) {
  let location;
  try {
    location = row.locationJson === null || row.locationJson === undefined ? undefined : JSON.parse(row.locationJson);
  } catch {
    location = null;
  }
  return {
    requestId: row.requestId,
    companyId: row.companyId,
    kioskUid: row.kioskUid,
    employeeId: row.employeeId,
    employeeName: row.employeeName || "",
    action: row.action,
    queuedAtMs: row.queuedAtMs,
    photoLocalUri: row.photoLocalUri || null,
    photoUploaded: row.photoUploaded === 1,
    location,
    uptimeAtMs: Number.isFinite(row.uptimeAtMs) ? row.uptimeAtMs : null,
    expectedAtMs: Number.isFinite(row.expectedAtMs) ? row.expectedAtMs : null,
    lastServerMs: Number.isFinite(row.lastServerMs) ? row.lastServerMs : null,
    sessionId: row.sessionId || null,
    status: row.status,
    failMessage: row.failMessage || "",
    attempts: row.attempts,
    createdAt: row.createdAt,
    syncedAt: row.syncedAt || null,
  };
}

async function keepPhoto(requestId, uri) {
  await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => {});
  const dest = `${PHOTO_DIR}${requestId}.jpg`;
  if (uri === dest) return dest;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

async function deleteFile(uri) {
  if (!uri) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

// Saves one kiosk punch (PIN always - spec: PIN on every action; photo only
// for clock in/out). clock = punchClockFields() (lib/clockAnchor.js).
export async function addKioskPunch({ requestId, companyId, kioskUid, employeeId, employeeName, action, pin, photoUri, location, clock }) {
  const photoLocalUri = photoUri ? await keepPhoto(requestId, photoUri) : null;
  await SecureStore.setItemAsync(pinKey(requestId), pin, SECURE_OPTS);
  const db = await getDb();
  const now = Date.now();
  await runWrite(() =>
    db.runAsync(
      `INSERT OR IGNORE INTO kiosk_queue
        (requestId, companyId, kioskUid, employeeId, employeeName, action, queuedAtMs, photoLocalUri, locationJson, uptimeAtMs, expectedAtMs, lastServerMs, sessionId, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?)`,
      [
        requestId, companyId, kioskUid, employeeId, employeeName || "", action, now, photoLocalUri,
        location === undefined ? null : JSON.stringify(location),
        clock?.uptimeAtMs ?? null, clock?.expectedAtMs ?? null, clock?.lastServerMs ?? null, clock?.sessionId ?? null, now,
      ]
    )
  );
  notify();
}

export async function listKioskPunches(kioskUid) {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM kiosk_queue WHERE kioskUid = ? ORDER BY queuedAtMs ASC", [kioskUid]);
  return rows.map(toItem);
}

export async function getKioskPin(requestId) {
  try {
    return await SecureStore.getItemAsync(pinKey(requestId), SECURE_OPTS);
  } catch {
    return null;
  }
}

async function update(requestId, sql, params) {
  const db = await getDb();
  await runWrite(() => db.runAsync(sql, [...params, requestId]));
  notify();
}

export function markKioskSyncing(requestId) {
  return update(requestId, "UPDATE kiosk_queue SET status = 'syncing', attempts = attempts + 1 WHERE requestId = ?", []);
}

export function markKioskWaiting(requestId) {
  return update(requestId, "UPDATE kiosk_queue SET status = 'waiting' WHERE requestId = ?", []);
}

export function markKioskPhotoUploaded(requestId) {
  return update(requestId, "UPDATE kiosk_queue SET photoUploaded = 1 WHERE requestId = ?", []);
}

export async function markKioskSynced(item) {
  await SecureStore.deleteItemAsync(pinKey(item.requestId), SECURE_OPTS).catch(() => {});
  await deleteFile(item.photoLocalUri);
  await update(item.requestId, "UPDATE kiosk_queue SET status = 'synced', syncedAt = ?, photoLocalUri = NULL WHERE requestId = ?", [Date.now()]);
  await setKioskMeta("lastSyncedAtMs", String(Date.now()));
}

export async function markKioskFailed(item, message) {
  await SecureStore.deleteItemAsync(pinKey(item.requestId), SECURE_OPTS).catch(() => {});
  await deleteFile(item.photoLocalUri);
  await update(item.requestId, "UPDATE kiosk_queue SET status = 'failed', failMessage = ?, photoLocalUri = NULL WHERE requestId = ?", [message || ""]);
}

// Synced punches are only kept a day (for the local status overlay).
export async function cleanupKioskQueue() {
  const db = await getDb();
  await runWrite(() => db.runAsync("DELETE FROM kiosk_queue WHERE status = 'synced' AND syncedAt < ?", [Date.now() - SYNCED_KEEP_MS]));
}

export async function kioskUnsentCount(kioskUid) {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT COUNT(*) as c FROM kiosk_queue WHERE kioskUid = ? AND status IN ('waiting','syncing')", [kioskUid]);
  return row ? row.c : 0;
}

export async function setKioskMeta(key, value) {
  const db = await getDb();
  await runWrite(() => db.runAsync("INSERT OR REPLACE INTO kiosk_meta (key, value) VALUES (?, ?)", [key, value]));
  notify();
}

export async function getKioskMeta(key) {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT value FROM kiosk_meta WHERE key = ?", [key]);
  return row ? row.value : null;
}
