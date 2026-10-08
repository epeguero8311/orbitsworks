import { collection, doc } from "firebase/firestore";
import { db as firestoreDb } from "./firebase";
import { getDb } from "./db";
import { makeLocalId } from "./clockQueue";
import { persistEmployeePhoto } from "./employeeQueue";
import { notifyEmployeeQueueChange } from "./employeeQueueEvents";

// Local-first, same idiom as queueCreateEmployee in employeeQueue.js: only
// touches the filesystem/SQLite and an unwritten local Firestore ID
// generator, so this resolves near-instantly whether online or not.
// updateId (not employeeId - that's the employee being edited, already
// existing) is generated here so the retaken photo can be uploaded to its
// own path (companies/{companyId}/employees/{employeeId}/updates/{updateId}.jpg)
// before updateEmployeeProfile ever runs - same ordering reason
// employeeQueueSync.js documents for create, which is what keeps a retried
// sync idempotent (see updateEmployeeProfile's lastUpdateId replay check).
export async function queueUpdateEmployee({
  employeeId,
  name,
  photoUri,
  deviceId,
  updatedByName,
  companyId,
}) {
  const updateId = doc(collection(firestoreDb, "companies", companyId, "employeeUpdates")).id;
  const photoLocalUri = photoUri ? await persistEmployeePhoto(photoUri) : null;

  const localId = makeLocalId();
  const now = Date.now();

  const sqlite = await getDb();
  await sqlite.runAsync(
    `INSERT INTO employee_update_queue
      (localId, employeeId, updateId, name, photoLocalUri, deviceId, updatedByName, syncStatus, attempts, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    [localId, employeeId, updateId, name ?? null, photoLocalUri, deviceId ?? null, updatedByName, now]
  );
  notifyEmployeeQueueChange();

  return { localId, employeeId, updateId };
}
