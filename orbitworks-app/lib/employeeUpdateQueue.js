import { collection, doc } from "firebase/firestore";
import { db as firestoreDb } from "./firebase";
import { getDb } from "./db";
import { makeLocalId } from "./clockQueue";
import { persistEmployeePhoto } from "./employeeQueue";
import { notifyEmployeeQueueChange } from "./employeeQueueEvents";
import { isPinUsedLocally, setLocalEmployeePin } from "./pinSync";

// Local-first, same idiom as queueCreateEmployee in employeeQueue.js: only
// touches the filesystem/SQLite and an unwritten local Firestore ID
// generator, so this resolves near-instantly whether online or not.
// updateId (not employeeId - that's the employee being edited, already
// existing) is generated here so the retaken photo can be uploaded to its
// own path (companies/{companyId}/employees/{employeeId}/updates/{updateId}.jpg)
// before updateEmployeeProfile ever runs - same ordering reason
// employeeQueueSync.js documents for create, which is what keeps a retried
// sync idempotent (see updateEmployeeProfile's lastUpdateId replay check).
// pin (admins/owners only, see EditEmployeeScreen.js): checked against
// every PIN this phone knows about first - a PIN another employee already
// uses is refused here (err.code "pinTaken") instead of queued. The server
// still has the final say on sync (another phone or the web may have taken
// it meanwhile) and swaps in a new unique PIN if so.
export async function queueUpdateEmployee({
  employeeId,
  employeeName,
  name,
  pin,
  photoUri,
  photoNoticeShownAt,
  deviceId,
  updatedByName,
  companyId,
}) {
  if (pin && (await isPinUsedLocally(pin, employeeId))) {
    const err = new Error("That PIN is already used by another employee.");
    err.code = "pinTaken";
    throw err;
  }

  const updateId = doc(collection(firestoreDb, "companies", companyId, "employeeUpdates")).id;
  const photoLocalUri = photoUri ? await persistEmployeePhoto(photoUri) : null;

  const localId = makeLocalId();
  const now = Date.now();

  const sqlite = await getDb();
  await sqlite.runAsync(
    `INSERT INTO employee_update_queue
      (localId, employeeId, updateId, name, pin, employeeName, photoLocalUri, deviceId, updatedByName, syncStatus, attempts, createdAt, photoNoticeShownAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [localId, employeeId, updateId, name ?? null, pin || null, name || employeeName || null, photoLocalUri, deviceId ?? null, updatedByName, now, photoLocalUri ? (photoNoticeShownAt ?? null) : null]
  );
  // The new PIN works on this phone right away and the old one stops.
  if (pin) await setLocalEmployeePin(employeeId, pin);
  notifyEmployeeQueueChange();

  return { localId, employeeId, updateId };
}
