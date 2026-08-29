import { getDb } from "./db";
import { deriveStatus } from "./clockStatus";

// Determines an employee's current status (in/out/break) entirely from
// local data - no Firestore query, works offline. Checks the local
// queue first (covers a chain of offline actions for the same employee
// in one session - clock in, break start, break end, all before any
// sync happens) and falls back to the last-synced status cached from
// the server via pinSync.js.
export async function getCurrentLocalStatus(employeeId) {
  const db = await getDb();

  const queuedRow = await db.getFirstAsync(
    `SELECT type FROM event_queue WHERE employeeId = ? ORDER BY clientTimestamp DESC LIMIT 1`,
    [employeeId]
  );
  if (queuedRow) return deriveStatus(queuedRow.type);

  const cacheRow = await db.getFirstAsync(
    `SELECT lastEventType FROM pin_cache WHERE employeeId = ?`,
    [employeeId]
  );
  return deriveStatus(cacheRow?.lastEventType ?? null);
}