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
import { getPunchDb } from "./punchQueueDb";
import { roleChangeSiteTracking } from "./siteTracking";
import { auth } from "./firebase";
import { OWN_ROW_SQL } from "./queueOwnerLogic";
import { badgeCount } from "./punchQueueLogic";
import { pendingSiteExitCount } from "./siteExitLogic";
import { listAllComments } from "./commentQueue";
import { listSiteExits } from "./siteExitStore";

// RC1 follow-up: the person's own other Employee App items still on the
// phone - comments (incl. Not synced ones), leave tracking rows and
// removal reports not yet on the server.
async function countOwnOtherItems(companyId, employeeId) {
  try {
    const db = await getPunchDb();
    const one = async (sql) => {
      const row = await db.getFirstAsync(sql, [companyId, employeeId]);
      return row ? row.c : 0;
    };
    const comments = await one("SELECT COUNT(*) as c FROM comment_queue WHERE companyId = ? AND employeeId = ? AND status IN ('waiting','syncing','failed')");
    const exits = await one("SELECT COUNT(*) as c FROM site_exit_queue WHERE companyId = ? AND employeeId = ? AND status IN ('waiting','syncing')");
    const reports = await one("SELECT COUNT(*) as c FROM removed_report_queue WHERE companyId = ? AND employeeId = ? AND status IN ('waiting','syncing')");
    return comments + exits + reports;
  } catch {
    return 0;
  }
}

function capped(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([Promise.resolve(promise).catch(() => {}), timeout]).finally(() => clearTimeout(timer));
}

async function countRows(sql, params = []) {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync(sql, params);
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
    // RC1 follow-up: end leave tracking first (roleChanged), so that row is
    // sent with the rest; then removal reports, punches, comments, leave
    // tracking - all with the old token.
    await capped(
      (async () => {
        await roleChangeSiteTracking(companyId, employeeId);
        await syncPunchQueue(companyId, employeeId);
      })(),
      maxMs
    );
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
    let punches = 0;
    try {
      punches = openOwnPunches(await listAllPunches(), companyId, employeeId).length;
    } catch {
      punches = 0;
    }
    return punches + (await countOwnOtherItems(companyId, employeeId));
  }
  if (drain === "staffQueues") {
    const c = await countStaffUnsent(companyId);
    return c.punches + c.employees;
  }
  return 0;
}

// Logout fix: the signed-in login's own unsent supervisor-app items for
// this company - { punches, employees } (clock events; employee creates
// and edits).
export async function countStaffUnsent(companyId) {
  const uid = auth.currentUser?.uid;
  if (!uid || !companyId) return { punches: 0, employees: 0 };
  const params = [uid, companyId];
  const punches = await getPendingCount(companyId).catch(() => 0);
  const creates = await countRows(
    `SELECT COUNT(*) as c FROM employee_queue WHERE syncStatus IN ('pending','syncing','failed') AND ${OWN_ROW_SQL}`,
    params
  );
  const updates = await countRows(
    `SELECT COUNT(*) as c FROM employee_update_queue WHERE syncStatus IN ('pending','syncing','failed') AND (createdByUid IS NULL OR ${OWN_ROW_SQL})`,
    params
  );
  return { punches, employees: creates + updates };
}

// Logout fix: the Employee App's unsent items, read fresh from the phone
// (same counts as the Settings warning, lib/employeeSettings.js
// logoutCounts) - { punches, comments, siteExits }.
export async function countEmployeeUnsent(companyId, employeeId) {
  if (!companyId || !employeeId) return { punches: 0, comments: 0, siteExits: 0 };
  const read = async (fn) => {
    try {
      return (await fn()) || [];
    } catch {
      return [];
    }
  };
  const [punches, comments, exits] = await Promise.all([read(listAllPunches), read(listAllComments), read(listSiteExits)]);
  return {
    punches: badgeCount(punches, companyId, employeeId),
    comments: badgeCount(comments, companyId, employeeId),
    siteExits: pendingSiteExitCount(exits, companyId, employeeId),
  };
}
