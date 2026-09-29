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