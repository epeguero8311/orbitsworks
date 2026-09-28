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

// Geofencing (Pro) auto site detection - the site an employee's session is
// currently at, entirely from local data. Same queue-first/cache-fallback
// shape as getCurrentLocalStatus above, so a clock-out queued right after
// its matching clock-in (before any sync) still finds the right site, and
// one queued after a sync/app-restart falls back to what the server last
// resolved that clock-in to (see lastEventSiteId/Name in pins.ts and
// clockEvents.ts). Advisory only - the server is the final say on which
// site a clock-out actually belongs to.
export async function getCurrentLocalSite(employeeId) {
  const db = await getDb();

  const queuedRow = await db.getFirstAsync(
    `SELECT siteId, siteName FROM event_queue WHERE employeeId = ? ORDER BY clientTimestamp DESC LIMIT 1`,
    [employeeId]
  );
  if (queuedRow) {
    return { siteId: queuedRow.siteId ?? null, siteName: queuedRow.siteName ?? "" };
  }

  const cacheRow = await db.getFirstAsync(
    `SELECT lastEventSiteId, lastEventSiteName FROM pin_cache WHERE employeeId = ?`,
    [employeeId]
  );
  return {
    siteId: cacheRow?.lastEventSiteId ?? null,
    siteName: cacheRow?.lastEventSiteName ?? "",
  };
}