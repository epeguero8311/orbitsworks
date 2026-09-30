import * as SQLite from "expo-sqlite";

let dbInstance = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync("orbitworks.db");

  await dbInstance.execAsync(`
    PRAGMA journal_mode = WAL;

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
      createdAt INTEGER NOT NULL
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
  `);

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
    "ALTER TABLE event_queue ADD COLUMN overrideEventId TEXT",
    "ALTER TABLE event_queue ADD COLUMN lat REAL",
    "ALTER TABLE event_queue ADD COLUMN lng REAL",
    "ALTER TABLE event_queue ADD COLUMN locationAccuracyM REAL",
    "ALTER TABLE event_queue ADD COLUMN locationAttempted INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE pin_cache ADD COLUMN lastEventSiteId TEXT",
    "ALTER TABLE pin_cache ADD COLUMN lastEventSiteName TEXT",
    "ALTER TABLE event_queue ADD COLUMN deviceId TEXT",
    "ALTER TABLE event_queue ADD COLUMN deviceNameSnapshot TEXT",
  ];
  for (const migration of migrations) {
    try {
      await dbInstance.execAsync(migration);
    } catch (e) {
      // column already exists - expected on every launch after the first
    }
  }

  return dbInstance;
}