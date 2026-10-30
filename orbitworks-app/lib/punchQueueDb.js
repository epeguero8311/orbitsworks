import * as SQLite from "expo-sqlite";

// Employee App Phase 4 - the phone's store for punches saved offline. Its
// own file (employee_punches.db), separate from the supervisor app's
// orbitworks.db (lib/db.js), so the two never share a lock or a schema.
// The PIN is NEVER stored here - only in SecureStore (lib/punchQueue.js).
//
// punch_queue: one row per saved punch. requestId is also the server's
// event id, so a resend can never write a second event.
//   status: waiting | syncing | synced | failed
//   failKind: redo | notRecorded | couldntSync (when failed)
//   photoUploaded: 1 once the photo is in Storage for this attempt
// punch_meta: small key/value rows (Last synced per employee).

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
  `);
  return db;
}
