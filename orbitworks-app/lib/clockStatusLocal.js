import { getDb } from "./db";
import { deriveStatus } from "./clockStatus";

// Determines an employee's current status (in/out/break) entirely from
// local data - no Firestore query, works offline. Compares this device's
// own latest queued action for the employee against the last-synced
// status cached from the server (pinSync.js) and trusts whichever is
// actually NEWER, rather than always preferring the local queue just
// because a row exists there.
//
// event_queue rows are deliberately kept for an hour after syncing (see
// queueSync.js's SYNCED_RETENTION_MS) so a clock-in this device just
// synced doesn't flicker back to a stale pin_cache snapshot before the
// next pull catches up - but that same retention meant a clock-out
// recorded elsewhere (the web admin dashboard, another device) during
// that hour was invisible here: this always returned the device's own
// now-stale "in" from that old queue row, so the next clock-in attempt
// on this device got evaluated as a clock-OUT instead and looked like it
// did nothing. Comparing timestamps fixes that without giving up the
// original retention behavior for the case it WAS built for.
export async function getCurrentLocalStatus(employeeId) {
  const db = await getDb();

  const queuedRow = await db.getFirstAsync(
    `SELECT type, clientTimestamp FROM event_queue WHERE employeeId = ? ORDER BY clientTimestamp DESC LIMIT 1`,
    [employeeId]
  );
  const cacheRow = await db.getFirstAsync(
    `SELECT lastEventType, lastEventTimestamp FROM pin_cache WHERE employeeId = ?`,
    [employeeId]
  );

  if (queuedRow && cacheRow?.lastEventTimestamp != null) {
    return queuedRow.clientTimestamp >= cacheRow.lastEventTimestamp
      ? deriveStatus(queuedRow.type)
      : deriveStatus(cacheRow.lastEventType);
  }
  if (queuedRow) return deriveStatus(queuedRow.type);
  return deriveStatus(cacheRow?.lastEventType ?? null);
}

// Geofencing (Pro) auto site detection - the site an employee's session is
// currently at, entirely from local data. Same newest-wins comparison as
// getCurrentLocalStatus above (and for the same reason - this device's
// own queued site can otherwise outlive its relevance for up to an hour
// after syncing, see queueSync.js), so a clock-out queued right after its
// matching clock-in (before any sync) still finds the right site, while a
// session that actually moved on server-side after this device's last
// local write falls back to what the server now knows instead of staying
// stuck on stale local history. Advisory only - the server is the final
// say on which site a clock-out actually belongs to.
export async function getCurrentLocalSite(employeeId) {
  const db = await getDb();

  const queuedRow = await db.getFirstAsync(
    `SELECT siteId, siteName, clientTimestamp FROM event_queue WHERE employeeId = ? ORDER BY clientTimestamp DESC LIMIT 1`,
    [employeeId]
  );
  const cacheRow = await db.getFirstAsync(
    `SELECT lastEventSiteId, lastEventSiteName, lastEventTimestamp FROM pin_cache WHERE employeeId = ?`,
    [employeeId]
  );

  if (queuedRow && cacheRow?.lastEventTimestamp != null && cacheRow.lastEventTimestamp > queuedRow.clientTimestamp) {
    return { siteId: cacheRow.lastEventSiteId ?? null, siteName: cacheRow.lastEventSiteName ?? "" };
  }
  if (queuedRow) {
    return { siteId: queuedRow.siteId ?? null, siteName: queuedRow.siteName ?? "" };
  }
  return {
    siteId: cacheRow?.lastEventSiteId ?? null,
    siteName: cacheRow?.lastEventSiteName ?? "",
  };
}