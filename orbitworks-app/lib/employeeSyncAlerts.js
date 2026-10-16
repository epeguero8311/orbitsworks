import { getDb } from "./db";
import { makeLocalId } from "./clockQueue";

// Mirrors lib/declinedClockIns.js's pub/sub-and-log shape, but kept as its
// own table/list (see db.js's employee_sync_alerts comment for why) rather
// than reusing that one directly.
const listeners = new Set();

export function subscribeEmployeeSyncAlertChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function notifyEmployeeSyncAlertChange() {
  listeners.forEach((cb) => cb());
}

const MAX_ROWS = 200;

export async function recordEmployeeSyncAlert({ employeeName, message }) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO employee_sync_alerts (id, employeeName, message, timestamp, read) VALUES (?, ?, ?, ?, 0)`,
    [makeLocalId(), employeeName, message, Date.now()]
  );
  await db.runAsync(
    `DELETE FROM employee_sync_alerts WHERE id NOT IN (
      SELECT id FROM employee_sync_alerts ORDER BY timestamp DESC LIMIT ?
    )`,
    [MAX_ROWS]
  );
  notifyEmployeeSyncAlertChange();
}

export async function getEmployeeSyncAlerts() {
  const db = await getDb();
  return db.getAllAsync("SELECT * FROM employee_sync_alerts ORDER BY timestamp DESC");
}

export async function getUnreadEmployeeSyncAlertCount() {
  const db = await getDb();
  const row = await db.getFirstAsync(
    "SELECT COUNT(*) as count FROM employee_sync_alerts WHERE read = 0"
  );
  return row?.count ?? 0;
}

export async function markAllEmployeeSyncAlertsRead() {
  const db = await getDb();
  await db.runAsync("UPDATE employee_sync_alerts SET read = 1 WHERE read = 0");
  notifyEmployeeSyncAlertChange();
}
