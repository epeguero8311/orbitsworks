import * as SQLite from "expo-sqlite";

// Employee App Phase 4 - the phone's store for punches saved offline. Its
// own file (employee_punches.db), separate from the supervisor app's
// orbitworks.db (lib/db.js), so the two never share a lock or a schema.
// The PIN is NEVER stored here - only in SecureStore (lib/punchQueue.js).
//
// punch_queue: one row per saved punch. requestId is also the server's
// event id, so a resend can never write a second event.
//   status: waiting | syncing | synced | failed
//   failKind: notRecorded | couldntSync (when failed; builds before Phase 5
//             also wrote "redo" - treated like couldntSync, Remove only)
//   photoUploaded: 1 once the photo is in Storage for this attempt
// punch_meta: small key/value rows (Last synced per employee).
// comment_queue (Phase 5): one row per shift comment (lib/commentQueue.js).
// requestId is also the shiftNotes doc id, so a resend can never write a
// second comment.
//   status: waiting | syncing | synced | failed (failed = Not synced)
// site_fence (Phase 8): one row per tracked shift (clockInEventId), its
// state as JSON (lib/siteExitLogic.js). Holds the site's place and radius,
// never the worker's own trail.
// site_exit_queue (Phase 8): one row per start / end of a "left" or
// "tracking off" stretch (lib/siteExitStore.js), sent by the same sync run
// after comments. requestId = exitId:phase. notBeforeMs holds a "left"
// start back until its 2 minutes have passed.
//   status: waiting | syncing | synced | failed (failed = dropped for good)

let dbPromise = null;

export function getPunchDb() {
  if (!dbPromise) {
    dbPromise = openDb().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

let writeChain = Promise.resolve();

// One write at a time on this file (same reason as runExclusive in
// lib/db.js). Reads don't wait - WAL lets them run beside a write.
export function runPunchWrite(fn) {
  const run = writeChain.then(() => fn());
  writeChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function openDb() {
  const db = await SQLite.openDatabaseAsync("employee_punches.db");
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS punch_queue (
      requestId TEXT PRIMARY KEY,
      companyId TEXT NOT NULL,
      employeeId TEXT NOT NULL,
      action TEXT NOT NULL,
      queuedAtMs INTEGER NOT NULL,
      siteName TEXT,
      photoLocalUri TEXT,
      photoUploaded INTEGER NOT NULL DEFAULT 0,
      hasPin INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'waiting',
      failKind TEXT,
      failReason TEXT,
      failMessage TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      syncedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS punch_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS comment_queue (
      requestId TEXT PRIMARY KEY,
      companyId TEXT NOT NULL,
      employeeId TEXT NOT NULL,
      clockEventId TEXT NOT NULL,
      note TEXT NOT NULL,
      madeAtMs INTEGER NOT NULL,
      createdByName TEXT,
      status TEXT NOT NULL DEFAULT 'waiting',
      failReason TEXT,
      failMessage TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      syncedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS site_fence (
      clockInEventId TEXT PRIMARY KEY,
      companyId TEXT NOT NULL,
      employeeId TEXT NOT NULL,
      state TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_exit_queue (
      requestId TEXT PRIMARY KEY,
      exitId TEXT NOT NULL,
      clockInEventId TEXT NOT NULL,
      companyId TEXT NOT NULL,
      employeeId TEXT NOT NULL,
      kind TEXT NOT NULL,
      phase TEXT NOT NULL,
      atMs INTEGER NOT NULL,
      notBeforeMs INTEGER NOT NULL,
      offReason TEXT,
      lat REAL,
      lng REAL,
      accuracyM REAL,
      fixAtMs INTEGER,
      status TEXT NOT NULL DEFAULT 'waiting',
      failReason TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      syncedAt INTEGER
    );
  `);
  // Added after Phase 4 (lib/clockAnchor.js): the punch's uptime, expected
  // time and app run id. Older rows keep NULL = normal queued rules.
  // Phase 6: the punch's location (lat, lng, accuracy, fix time) and
  // locationAttempted (1 = tried; older rows NULL = sent with no location).
  const cols = await db.getAllAsync("PRAGMA table_info(punch_queue)");
  const have = new Set(cols.map((c) => c.name));
  for (const [name, type] of [
    ["uptimeAtMs", "INTEGER"],
    ["expectedAtMs", "INTEGER"],
    ["sessionId", "TEXT"],
    ["lat", "REAL"],
    ["lng", "REAL"],
    ["locationAccuracyM", "REAL"],
    ["locationFixAtMs", "INTEGER"],
    ["locationAttempted", "INTEGER"],
  ]) {
    if (!have.has(name)) await db.execAsync(`ALTER TABLE punch_queue ADD COLUMN ${name} ${type}`);
  }
  return db;
}
