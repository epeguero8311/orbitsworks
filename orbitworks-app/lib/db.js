import * as SQLite from "expo-sqlite";

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDb().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

let writeChain = Promise.resolve();

// Serializes every SQLite WRITE across the app through one JS-level
// queue, instead of relying on SQLite's own busy-retry handler. This app
// has several independent write paths on this one connection
// (employee_queue, event_queue, pin_cache via syncPinTable, etc.) with no
// coordination between them, and confirmed via device log that
// PRAGMA busy_timeout = 5000 IS set on the connection yet "database is
// locked" still fires when two of them overlap on Android - so this
// guarantees no two writes are ever actually in flight at once, rather
// than hoping the native busy handler retries for us. Reads are
// deliberately NOT queued through this - WAL mode lets readers run
// without blocking or being blocked by a writer, only writer-vs-writer
// actually contends.
export function runExclusive(fn) {
  const run = writeChain.then(() => fn());
  writeChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function openDb() {
  const db = await SQLite.openDatabaseAsync("orbitworks.db");

  // busy_timeout tells SQLite to wait and retry internally for up to 5s
  // when a write collides with another writer already holding the lock,
  // instead of throwing "database is locked" the instant two legitimate
  // writes overlap by even a few ms - this app has several independent
  // write paths on this one connection (employee_queue, event_queue,
  // pin_cache via syncPinTable, etc.) with no shared mutex between them,
  // so brief overlaps are expected, not a sign of a real deadlock.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS pin_cache (
      employeeId TEXT PRIMARY KEY,
      hashedPin TEXT NOT NULL,
      name TEXT NOT NULL,
      jobTitle TEXT,
      photoUrl TEXT,
      assignedSiteIds TEXT,
      isSupervisor INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      lastEventType TEXT,
      lastEventTimestamp INTEGER,
      lastEventSiteId TEXT,
      lastEventSiteName TEXT,
      subcontractorId TEXT,
      subcontractorName TEXT,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS event_queue (
      localId TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      employeeName TEXT NOT NULL,
      siteId TEXT,
      siteName TEXT,
      type TEXT NOT NULL,
      photoLocalUri TEXT,
      note TEXT,
      source TEXT,
      authorizedById TEXT,
      authorizedByName TEXT,
      createdByUid TEXT NOT NULL,
      clientTimestamp INTEGER NOT NULL,
      syncStatus TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      subcontractorId TEXT,
      subcontractorName TEXT,
      reason TEXT,
      overrideEventId TEXT,
      lat REAL,
      lng REAL,
      locationAccuracyM REAL,
      locationAttempted INTEGER NOT NULL DEFAULT 0,
      deviceId TEXT,
      deviceNameSnapshot TEXT,
      createdAt INTEGER NOT NULL,
      syncedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Geofencing (Pro) Part 3: site geofence config, synced alongside
    -- pin_cache (see pinSync.js) so a clock-in has something to check
    -- against even on a fully offline cold start. requireGeofence/lat/lng/
    -- radiusMeters mirror JobSite in lib/types.ts on the web side.
    CREATE TABLE IF NOT EXISTS sites_cache (
      siteId TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      requireGeofence INTEGER DEFAULT 0,
      lat REAL,
      lng REAL,
      radiusMeters REAL,
      updatedAt INTEGER
    );

    -- Geofencing (Pro) auto site detection - every declined/failed clock-in
    -- (a Block-mode geofence denial, a deactivated employee, etc.), local
    -- only since a blocked attempt is never queued/synced to the server at
    -- all - this is the only record it leaves. Read by the alert bell (see
    -- lib/declinedClockIns.js); "read" tracks the bell's unread badge.
    CREATE TABLE IF NOT EXISTS declined_clock_ins (
      id TEXT PRIMARY KEY,
      employeeId TEXT,
      employeeName TEXT NOT NULL,
      reason TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );

    -- Create Employee (mobile) - local-first offline queue, same shape and
    -- purpose as event_queue but for a brand new employee instead of a clock
    -- event (see lib/employeeQueue.js / lib/employeeQueueSync.js). employeeId
    -- is generated on-device before anything is queued (a client-side
    -- Firestore auto-ID, never written until the sync step) so the reference
    -- photo can be uploaded to its final Storage path before the
    -- createEmployee call that actually creates the Firestore doc there -
    -- see employeeQueueSync.js for why that ordering is what makes this
    -- retry-safe. clientPin is this device's own on-device guess (deduped
    -- against pin_cache below) - blanked out the moment sync succeeds (the
    -- PIN itself is never stored once it's been handed off, per spec), kept
    -- as an empty string rather than dropped so a synced/rejected row is
    -- still distinguishable from one still waiting to try.
    CREATE TABLE IF NOT EXISTS employee_queue (
      localId TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      name TEXT NOT NULL,
      photoLocalUri TEXT NOT NULL,
      clientPin TEXT NOT NULL,
      createdByUid TEXT NOT NULL,
      syncStatus TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      createdAt INTEGER NOT NULL
    );

    -- Create Employee (mobile) - local, device-only notifications for the
    -- two cases spec'd as "alert the admin": a queued PIN collided with one
    -- reserved elsewhere before this device could sync (serverPin differs
    -- from clientPin), or the company turned the feature off before this
    -- device's queued item could sync (a hard rejection, never retried).
    -- Deliberately its own table/screen rather than folding into
    -- declined_clock_ins - that one's bell is gated behind isPro (Geofencing
    -- Pro), but this toggle isn't a Pro feature, so its alert must be visible
    -- on every plan.
    CREATE TABLE IF NOT EXISTS employee_sync_alerts (
      id TEXT PRIMARY KEY,
      employeeName TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );

    -- Update Employee (mobile) - local-first offline queue, same role as
    -- employee_queue above but for editing an existing employee's name/photo
    -- instead of creating a new one (see lib/employeeUpdateQueue.js / lib/
    -- employeeUpdateQueueSync.js). A separate table rather than a shared one
    -- with employee_queue: no PIN here, and photoLocalUri is nullable (a
    -- name-only edit queues with no photo at all) where employee_queue's is
    -- always required. updateId is this edit's own client-generated
    -- Firestore auto-ID (companies/{companyId}/employeeUpdates/{updateId}),
    -- separate from employeeId (which employee this edit is about) - mirrors
    -- updateEmployeeProfile's idempotent-replay-by-updateId check
    -- server-side.
    CREATE TABLE IF NOT EXISTS employee_update_queue (
      localId TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      updateId TEXT NOT NULL,
      name TEXT,
      photoLocalUri TEXT,
      deviceId TEXT,
      updatedByName TEXT NOT NULL,
      syncStatus TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      createdAt INTEGER NOT NULL
    );
  `);

  // One-time confirmation that the pragmas above actually took on this
  // connection/platform - PRAGMA statements inside a batched execAsync
  // string are not guaranteed to report back, so this reads them back
  // explicitly rather than assuming the batch above applied them.
  const journalMode = await db.getFirstAsync("PRAGMA journal_mode");
  const busyTimeout = await db.getFirstAsync("PRAGMA busy_timeout");
  console.log("[db] journal_mode =", journalMode, "busy_timeout =", busyTimeout);

  // Migrations for installs created before these columns existed - ALTER
  // TABLE has no IF NOT EXISTS for columns, so each is wrapped and the
  // "duplicate column" error is swallowed on every run after the first.
  const migrations = [
    "ALTER TABLE pin_cache ADD COLUMN lastEventType TEXT",
    "ALTER TABLE pin_cache ADD COLUMN subcontractorId TEXT",
    "ALTER TABLE pin_cache ADD COLUMN subcontractorName TEXT",
    "ALTER TABLE event_queue ADD COLUMN subcontractorId TEXT",
    "ALTER TABLE event_queue ADD COLUMN subcontractorName TEXT",
    "ALTER TABLE event_queue ADD COLUMN reason TEXT",
    "ALTER TABLE event_queue ADD COLUMN lat REAL",
    "ALTER TABLE event_queue ADD COLUMN lng REAL",
    "ALTER TABLE event_queue ADD COLUMN locationAccuracyM REAL",
    "ALTER TABLE event_queue ADD COLUMN locationAttempted INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE pin_cache ADD COLUMN lastEventSiteId TEXT",
    "ALTER TABLE pin_cache ADD COLUMN lastEventSiteName TEXT",
    "ALTER TABLE event_queue ADD COLUMN deviceId TEXT",
    "ALTER TABLE event_queue ADD COLUMN deviceNameSnapshot TEXT",
    "ALTER TABLE event_queue ADD COLUMN syncedAt INTEGER",
    "ALTER TABLE pin_cache ADD COLUMN lastEventTimestamp INTEGER",
    "ALTER TABLE event_queue ADD COLUMN backedUp INTEGER NOT NULL DEFAULT 0",
    // Sync speed-up: earliest time (ms) a failed row may be retried by an
    // automatic drain. NULL = retry on the next drain. See queueSync.js.
    "ALTER TABLE event_queue ADD COLUMN nextAttemptAt INTEGER",
    // Notice-before-capture (Terms Section 4.1) - the on-device moment the
    // identity-verification notice was acknowledged, in ms (Date.now()),
    // threaded through to createEmployee/updateEmployeeProfile as
    // photoNoticeShownAt. Null on a name-only employee_update_queue row
    // (no photo, no notice shown).
    "ALTER TABLE employee_queue ADD COLUMN photoNoticeShownAt INTEGER",
    "ALTER TABLE employee_update_queue ADD COLUMN photoNoticeShownAt INTEGER",
  ];
  for (const migration of migrations) {
    try {
      await db.execAsync(migration);
    } catch (e) {
      // column already exists - expected on every launch after the first
    }
  }

  return db;
}