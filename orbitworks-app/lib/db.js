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
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migration for installs created before lastEventType existed - ALTER
  // TABLE has no IF NOT EXISTS for columns, so this is wrapped and the
  // "duplicate column" error is swallowed on every run after the first.
  try {
    await dbInstance.execAsync("ALTER TABLE pin_cache ADD COLUMN lastEventType TEXT");
  } catch (e) {
    // column already exists - expected on every launch after the first
  }

  return dbInstance;
}