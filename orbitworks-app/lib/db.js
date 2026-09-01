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
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
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