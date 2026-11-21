// RC1 - what one role saved on this phone, for a role change: send it
// before the switch (with the old token) and count what's still left.
// Decisions live in roleSync.js; this file only does the I/O.
import { drainQueue, getPendingCount } from "./queueSync";
import { drainEmployeeQueue } from "./employeeQueueSync";
import { drainEmployeeUpdateQueue } from "./employeeUpdateQueueSync";
import { syncPunchQueue } from "./punchQueueSync";
import { listAllPunches } from "./punchQueue";
import { getDb } from "./db";
import { openOwnPunches } from "./roleSync";

function capped(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([Promise.resolve(promise).catch(() => {}), timeout]).finally(() => clearTimeout(timer));
}

async function countRows(sql) {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync(sql);
    return row ? row.c : 0;
  } catch {
    return 0;
  }
}

// Sends one role's queue, giving up after maxMs (what's left stays on the
// phone - nothing is ever deleted here).
export async function drainForRole(drain, { companyId, employeeId }, maxMs) {
  if (!drain || !companyId) return;
  if (drain === "employeePunches") {
    if (!employeeId) return;
    await capped(syncPunchQueue(companyId, employeeId), maxMs);
    return;
  }
  if (drain === "staffQueues") {
    // New employees first: their clock events wait for the create.
    await capped(
      (async () => {
        await drainEmployeeQueue(companyId);
        await drainEmployeeUpdateQueue(companyId);
        await drainQueue(companyId, "syncNow");
      })(),
      maxMs
    );
  }
}

// How many of that role's items are still not on the server.
export async function countLeftover(drain, { companyId, employeeId }) {
  if (drain === "employeePunches") {
    try {
      return openOwnPunches(await listAllPunches(), companyId, employeeId).length;
    } catch {
      return 0;
    }
  }
  if (drain === "staffQueues") {
    const events = await getPendingCount().catch(() => 0);
    const creates = await countRows(
      "SELECT COUNT(*) as c FROM employee_queue WHERE syncStatus IN ('pending','syncing','failed')"
    );
    const updates = await countRows(
      "SELECT COUNT(*) as c FROM employee_update_queue WHERE syncStatus IN ('pending','syncing','failed')"
    );
    return events + creates + updates;
  }
  return 0;
}
