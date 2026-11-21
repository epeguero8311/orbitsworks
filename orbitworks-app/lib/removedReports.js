import { getPunchDb, runPunchWrite } from "./punchQueueDb";
import { notifyPunchQueue } from "./punchQueueEvents";
import { buildRemovedReport } from "./removedReportLogic";

// RC1 follow-up - the phone's queue of "the employee removed an unsent punch
// / comment" reports (removed_report_queue in employee_punches.db). Sent by
// lib/removedReportSync.js; decisions in lib/removedReportLogic.js.

function toRow(r) {
  return {
    requestId: r.requestId,
    companyId: r.companyId,
    employeeId: r.employeeId,
    kind: r.kind,
    action: r.action ?? null,
    madeAtMs: r.madeAtMs,
    removedAtMs: r.removedAtMs,
    failMessage: r.failMessage ?? null,
    clockEventId: r.clockEventId ?? null,
    note: r.note ?? null,
    status: r.status,
    attempts: r.attempts,
    createdAt: r.createdAt,
  };
}

// Saves the report and deletes the queue row in ONE transaction: if the
// report can't be saved, nothing is removed (the call throws and the row
// stays on the Sync tab). deleteSql takes the requestId as its only param.
export async function removeWithReport(kind, item, deleteSql) {
  const nowMs = Date.now();
  const r = buildRemovedReport(kind, item, nowMs);
  const db = await getPunchDb();
  await runPunchWrite(() =>
    db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT OR REPLACE INTO removed_report_queue
          (requestId, companyId, employeeId, kind, action, madeAtMs, removedAtMs, failMessage, clockEventId, note, status, attempts, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', 0, ?)`,
        [r.requestId, r.companyId, r.employeeId, r.kind, r.action, r.madeAtMs, r.removedAtMs, r.failMessage, r.clockEventId, r.note, nowMs]
      );
      await db.runAsync(deleteSql, [item.requestId]);
    })
  );
}

export async function listRemovedReports() {
  const db = await getPunchDb();
  const rows = await db.getAllAsync("SELECT * FROM removed_report_queue");
  return rows.map(toRow);
}

async function setStatus(requestId, sql, params = []) {
  const db = await getPunchDb();
  await runPunchWrite(() => db.runAsync(`UPDATE removed_report_queue SET ${sql} WHERE requestId = ?`, [...params, requestId]));
  notifyPunchQueue();
}

export const markReportSyncing = (requestId) => setStatus(requestId, "status = 'syncing', attempts = attempts + 1");
export const markReportWaiting = (requestId) => setStatus(requestId, "status = 'waiting'");
export const markReportRefused = (requestId) => setStatus(requestId, "status = 'failed'");

// The server has it: nothing more to keep.
export async function deleteReport(requestId) {
  const db = await getPunchDb();
  await runPunchWrite(() => db.runAsync("DELETE FROM removed_report_queue WHERE requestId = ?", [requestId]));
  notifyPunchQueue();
}

// Startup: a report left "syncing" by a killed app goes back to waiting.
export async function resetSyncingReports() {
  const db = await getPunchDb();
  await runPunchWrite(() => db.runAsync("UPDATE removed_report_queue SET status = 'waiting' WHERE status = 'syncing'"));
}
