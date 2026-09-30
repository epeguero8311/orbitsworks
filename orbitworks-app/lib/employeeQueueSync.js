import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { functions, storage } from "./firebase";
import { getDb } from "./db";
import { recordEmployeeSyncAlert } from "./employeeSyncAlerts";
import { notifyEmployeeQueueChange } from "./employeeQueueEvents";
import { syncPinTable } from "./pinSync";

let syncing = false;

// How long a synced/rejected row stays in employee_queue before cleanup
// deletes it - same retention idea as SYNCED_RETENTION_MS in queueSync.js,
// just generous enough to be visible in a quick debug session, not tied to
// any listener catch-up window the way that one is.
const RETENTION_MS = 60 * 60 * 1000; // 1 hour

// Error codes from createEmployee that will never succeed on retry - the
// toggle is off, the plan is past due/at its employee cap, the PIN space is
// exhausted, or the input itself is invalid. Anything else (network drop,
// functions/unavailable, functions/internal) is treated as transient and
// retried on the next drain pass, same policy as clock event sync.
const TERMINAL_CODES = new Set([
  "functions/failed-precondition",
  "functions/resource-exhausted",
  "functions/already-exists",
  "functions/invalid-argument",
  "functions/permission-denied",
]);

async function uploadReferencePhoto(companyId, employeeId, localUri) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const photoRef = ref(storage, `companies/${companyId}/employees/${employeeId}/reference.jpg`);
  await uploadBytes(photoRef, blob);
  return getDownloadURL(photoRef);
}

// Processes exactly one queue row: uploads the reference photo (if not
// already done - photoLocalUri is only cleared once this succeeds) then
// calls createEmployee. Safe to call more than once for the same row - the
// employeeId was generated on-device up front (see employeeQueue.js), so a
// retry after an app kill just re-uploads to the same Storage path and
// createEmployee's own idempotent-replay check (matching createdByUid and
// name) returns the same PIN instead of erroring or reserving a second one.
//
// clientPin is blanked the moment sync succeeds, rather than left until
// cleanupEmployeeQueue's retention window deletes the row - per spec, the
// PIN is never stored in the app once it's been handed off (shown in the
// success modal for an online create, or recorded into the sync alert for
// an offline one that changed). The caller gets the PIN back as this
// function's return value instead of having to re-read the row afterward.
async function syncOne(sqlite, item, companyId) {
  const photoUrl = await uploadReferencePhoto(companyId, item.employeeId, item.photoLocalUri);

  const createEmployeeFn = httpsCallable(functions, "createEmployee");
  const result = await createEmployeeFn({
    employeeId: item.employeeId,
    name: item.name,
    photoUrl,
    clientPin: item.clientPin,
  });
  const { pin, pinChanged } = result.data;

  await FileSystem.deleteAsync(item.photoLocalUri, { idempotent: true });
  await sqlite.runAsync(
    "UPDATE employee_queue SET syncStatus = 'synced', clientPin = '' WHERE localId = ?",
    [item.localId]
  );

  if (pinChanged) {
    await recordEmployeeSyncAlert({
      employeeName: item.name,
      message: `${item.name}'s PIN changed to ${pin} because ${item.clientPin} was already taken by the time this synced. Share the new PIN with them.`,
    });
  }

  // Refreshes pin_cache right away so the new employee can clock in on this
  // device immediately, instead of waiting for the next scheduled pull.
  await syncPinTable().catch(() => {});

  return { pin, pinChanged };
}

async function markTerminal(sqlite, item, message) {
  // Rejected rows never retry, so the local photo is done being useful -
  // clean it up now instead of leaving it on device until cleanupEmployeeQueue's
  // retention window deletes the row (see queueSync.js's own delete-on-success
  // for the same idea, just triggered on rejection here instead).
  await FileSystem.deleteAsync(item.photoLocalUri, { idempotent: true });
  await sqlite.runAsync(
    "UPDATE employee_queue SET syncStatus = 'rejected', lastError = ? WHERE localId = ?",
    [message, item.localId]
  );
  await recordEmployeeSyncAlert({
    employeeName: item.name,
    message: `${item.name} couldn't be created: ${message}`,
  });
}

export async function cleanupEmployeeQueue() {
  const sqlite = await getDb();
  await sqlite.runAsync(
    "DELETE FROM employee_queue WHERE syncStatus IN ('synced','rejected') AND createdAt < ?",
    [Date.now() - RETENTION_MS]
  );
}

// Attempts to sync a single queue row right now, by localId - used by the
// Create Employee screen to get a real server-confirmed PIN back while the
// person is still on the success step, when there's signal to try
// immediately (see CreateEmployeeScreen.js). Returns null if the row is
// missing or another sync is already in flight (drainEmployeeQueue will
// pick it up instead).
export async function syncEmployeeQueueItemNow(localId, companyId) {
  if (syncing) return null;
  const sqlite = await getDb();
  const item = await sqlite.getFirstAsync(
    "SELECT * FROM employee_queue WHERE localId = ? AND syncStatus IN ('pending','failed')",
    [localId]
  );
  if (!item) return null;

  syncing = true;
  try {
    await sqlite.runAsync("UPDATE employee_queue SET syncStatus = 'syncing' WHERE localId = ?", [localId]);
    try {
      const { pin } = await syncOne(sqlite, item, companyId);
      notifyEmployeeQueueChange();
      return { success: true, pin };
    } catch (err) {
      if (TERMINAL_CODES.has(err?.code)) {
        await markTerminal(sqlite, item, err.message || "Not authorized.");
        notifyEmployeeQueueChange();
        return { success: false, terminal: true };
      }
      await sqlite.runAsync(
        "UPDATE employee_queue SET syncStatus = 'failed', attempts = attempts + 1, lastError = ? WHERE localId = ?",
        [err.message || "Unknown error", localId]
      );
      notifyEmployeeQueueChange();
      return { success: false, terminal: false };
    }
  } finally {
    syncing = false;
  }
}

export async function drainEmployeeQueue(companyId) {
  if (syncing || !companyId) return;
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  syncing = true;
  try {
    await cleanupEmployeeQueue().catch(() => {});

    const sqlite = await getDb();
    const pending = await sqlite.getAllAsync(
      "SELECT * FROM employee_queue WHERE syncStatus IN ('pending','failed') ORDER BY createdAt ASC"
    );

    for (const item of pending) {
      await sqlite.runAsync("UPDATE employee_queue SET syncStatus = 'syncing' WHERE localId = ?", [item.localId]);
      try {
        await syncOne(sqlite, item, companyId);
      } catch (err) {
        console.log("Employee queue sync failed for", item.localId, err.message);
        if (TERMINAL_CODES.has(err?.code)) {
          await markTerminal(sqlite, item, err.message || "Not authorized.");
        } else {
          await sqlite.runAsync(
            "UPDATE employee_queue SET syncStatus = 'failed', attempts = attempts + 1, lastError = ? WHERE localId = ?",
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

export async function resetStuckEmployeeSyncs() {
  const sqlite = await getDb();
  await sqlite.runAsync("UPDATE employee_queue SET syncStatus = 'pending' WHERE syncStatus = 'syncing'");
}
