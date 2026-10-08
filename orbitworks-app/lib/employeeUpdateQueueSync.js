import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { functions, storage } from "./firebase";
import { getDb } from "./db";
import { recordEmployeeSyncAlert } from "./employeeSyncAlerts";
import { notifyEmployeeQueueChange } from "./employeeQueueEvents";

let syncing = false;

// Same retention idea as employeeQueueSync.js's RETENTION_MS.
const RETENTION_MS = 60 * 60 * 1000; // 1 hour

// Error codes from updateEmployeeProfile that will never succeed on retry -
// the toggle is off, the employee is inactive/gone, the subscription is
// past due, or the input itself is invalid. Anything else (network drop,
// functions/unavailable, functions/internal) is treated as transient and
// retried on the next drain pass, same policy as employeeQueueSync.js.
const TERMINAL_CODES = new Set([
  "functions/failed-precondition",
  "functions/not-found",
  "functions/invalid-argument",
  "functions/permission-denied",
]);

async function uploadUpdatePhoto(companyId, employeeId, updateId, localUri) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const photoRef = ref(storage, `companies/${companyId}/employees/${employeeId}/updates/${updateId}.jpg`);
  await uploadBytes(photoRef, blob);
  return getDownloadURL(photoRef);
}

// Processes exactly one queue row: uploads the retaken photo (if any, and
// not already done - photoLocalUri is only cleared once this succeeds),
// then calls updateEmployeeProfile. Safe to call more than once for the
// same row - updateId was generated on-device up front (see
// employeeUpdateQueue.js), so a retry after an app kill just re-uploads to
// the same Storage path and updateEmployeeProfile's own idempotent-replay
// check (matching lastUpdateId) returns success without redoing the write.
async function syncOne(sqlite, item, companyId) {
  const photoUrl = item.photoLocalUri
    ? await uploadUpdatePhoto(companyId, item.employeeId, item.updateId, item.photoLocalUri)
    : undefined;

  const updateEmployeeProfileFn = httpsCallable(functions, "updateEmployeeProfile");
  await updateEmployeeProfileFn({
    employeeId: item.employeeId,
    updateId: item.updateId,
    ...(item.name ? { name: item.name } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    deviceId: item.deviceId,
    updatedByName: item.updatedByName,
  });

  if (item.photoLocalUri) {
    await FileSystem.deleteAsync(item.photoLocalUri, { idempotent: true });
  }
  await sqlite.runAsync(
    "UPDATE employee_update_queue SET syncStatus = 'synced' WHERE localId = ?",
    [item.localId]
  );
}

async function markTerminal(sqlite, item, message) {
  if (item.photoLocalUri) {
    await FileSystem.deleteAsync(item.photoLocalUri, { idempotent: true });
  }
  await sqlite.runAsync(
    "UPDATE employee_update_queue SET syncStatus = 'rejected', lastError = ? WHERE localId = ?",
    [message, item.localId]
  );
  await recordEmployeeSyncAlert({
    employeeName: item.name || "An employee",
    message: `An employee update couldn't be saved: ${message}`,
  });
}

export async function cleanupEmployeeUpdateQueue() {
  const sqlite = await getDb();
  await sqlite.runAsync(
    "DELETE FROM employee_update_queue WHERE syncStatus IN ('synced','rejected') AND createdAt < ?",
    [Date.now() - RETENTION_MS]
  );
}

// Attempts to sync a single queue row right now, by localId - used by the
// edit screen to get immediate feedback while the person is still there
// (see EditEmployeeScreen.js). Returns null if the row is missing or
// another sync is already in flight (drainEmployeeUpdateQueue picks it up
// instead).
export async function syncEmployeeUpdateQueueItemNow(localId, companyId) {
  if (syncing) return null;
  const sqlite = await getDb();
  const item = await sqlite.getFirstAsync(
    "SELECT * FROM employee_update_queue WHERE localId = ? AND syncStatus IN ('pending','failed')",
    [localId]
  );
  if (!item) return null;

  syncing = true;
  try {
    await sqlite.runAsync("UPDATE employee_update_queue SET syncStatus = 'syncing' WHERE localId = ?", [localId]);
    try {
      await syncOne(sqlite, item, companyId);
      notifyEmployeeQueueChange();
      return { success: true };
    } catch (err) {
      if (TERMINAL_CODES.has(err?.code)) {
        await markTerminal(sqlite, item, err.message || "Not authorized.");
        notifyEmployeeQueueChange();
        return { success: false, terminal: true };
      }
      await sqlite.runAsync(
        "UPDATE employee_update_queue SET syncStatus = 'failed', attempts = attempts + 1, lastError = ? WHERE localId = ?",
        [err.message || "Unknown error", localId]
      );
      notifyEmployeeQueueChange();
      return { success: false, terminal: false };
    }
  } finally {
    syncing = false;
  }
}

export async function drainEmployeeUpdateQueue(companyId) {
  if (syncing || !companyId) return;
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  syncing = true;
  try {
    await cleanupEmployeeUpdateQueue().catch(() => {});

    const sqlite = await getDb();
    const pending = await sqlite.getAllAsync(
      "SELECT * FROM employee_update_queue WHERE syncStatus IN ('pending','failed') ORDER BY createdAt ASC"
    );

    for (const item of pending) {
      await sqlite.runAsync("UPDATE employee_update_queue SET syncStatus = 'syncing' WHERE localId = ?", [item.localId]);
      try {
        await syncOne(sqlite, item, companyId);
      } catch (err) {
        console.log("Employee update queue sync failed for", item.localId, err.message);
        if (TERMINAL_CODES.has(err?.code)) {
          await markTerminal(sqlite, item, err.message || "Not authorized.");
        } else {
          await sqlite.runAsync(
            "UPDATE employee_update_queue SET syncStatus = 'failed', attempts = attempts + 1, lastError = ? WHERE localId = ?",
            [err.message || "Unknown error", item.localId]
          );
        }
      }
    }
    notifyEmployeeQueueChange();
  } finally {
    syncing = false;
  }
}

export async function resetStuckEmployeeUpdateSyncs() {
  const sqlite = await getDb();
  await sqlite.runAsync("UPDATE employee_update_queue SET syncStatus = 'pending' WHERE syncStatus = 'syncing'");
}
