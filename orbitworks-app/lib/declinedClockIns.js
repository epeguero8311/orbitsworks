import { getDb } from "./db";
import { makeLocalId } from "./clockQueue";
import { notifyDeclinedChange } from "./declinedEvents";

const MAX_ROWS = 200;

// Geofencing (Pro) auto site detection - called from ClockDeclinedScreen
// whenever a clock-in is declined (Block-mode geofence denial, a
// deactivated employee, etc.). Trimmed to the most recent MAX_ROWS rows on
// every insert so this can't grow unbounded over months of use - nothing
// else ever deletes from this table, unlike event_queue which clears rows
// once they sync.
export async function recordDeclinedClockIn({ employeeId, employeeName, reason }) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO declined_clock_ins (id, employeeId, employeeName, reason, timestamp, read) VALUES (?, ?, ?, ?, ?, 0)`,
    [makeLocalId(), employeeId ?? null, employeeName, reason, Date.now()]
  );
  await db.runAsync(
    `DELETE FROM declined_clock_ins WHERE id NOT IN (
      SELECT id FROM declined_clock_ins ORDER BY timestamp DESC LIMIT ?
    )`,
    [MAX_ROWS]
  );
  notifyDeclinedChange();
}

export async function getDeclinedClockIns() {
  const db = await getDb();
  return db.getAllAsync("SELECT * FROM declined_clock_ins ORDER BY timestamp DESC");
}

export async function getUnreadDeclinedCount() {
  const db = await getDb();
  const row = await db.getFirstAsync(
    "SELECT COUNT(*) as count FROM declined_clock_ins WHERE read = 0"
  );
  return row?.count ?? 0;
}

export async function markAllDeclinedRead() {
  const db = await getDb();
  await db.runAsync("UPDATE declined_clock_ins SET read = 1 WHERE read = 0");
  notifyDeclinedChange();
}
