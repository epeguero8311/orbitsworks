import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { collection, doc } from "firebase/firestore";
import { db as firestoreDb } from "./firebase";
import { getDb } from "./db";
import { makeLocalId } from "./clockQueue";
import { notifyEmployeeQueueChange } from "./employeeQueueEvents";
import { randomNonJunkPin } from "./validators/createEmployee";

async function hashPin(pin) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

// Guesses a PIN this device hasn't already cached for another employee -
// pin_cache only ever stores hashedPin (see pinSync.js), never plaintext, so
// dedup here means hashing each candidate and checking for a match, the same
// way findEmployeeByPinLocal looks one up. This is only ever a guess: the
// server's own reservation (createEmployee, functions/src/createEmployee.ts)
// is the real source of truth and may return a different PIN on sync if this
// one collided with something reserved elsewhere in the meantime.
async function generateLocalPin() {
  const sqlite = await getDb();
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomNonJunkPin();
    const hashed = await hashPin(candidate);
    const existing = await sqlite.getFirstAsync(
      "SELECT 1 FROM pin_cache WHERE hashedPin = ?",
      [hashed]
    );
    if (!existing) return candidate;
  }
  // Exceedingly unlikely (would require ~20 collisions against a company's
  // own cached PIN table) - fall back to any non-junk candidate and let the
  // server's own reservation be the real dedup authority on sync.
  return randomNonJunkPin();
}

async function persistEmployeePhoto(photoUri) {
  const dir = `${FileSystem.documentDirectory}employeePhotos/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.copyAsync({ from: photoUri, to: dest });
  return dest;
}

// Local-first, same idiom as queueClockEvent in clockQueue.js: only touches
// the filesystem, SQLite, and (for the ID) an unwritten local Firestore ID
// generator, so this resolves near-instantly whether online or not.
// employeeId is generated here, not by the server, so the reference photo
// can be uploaded to its final Storage path (companies/{companyId}/
// employees/{employeeId}/reference.jpg) before createEmployee ever runs -
// see employeeQueueSync.js for why that ordering is what makes sync
// idempotent and retry-safe without a separate rollback step.
export async function queueCreateEmployee({ name, photoUri, createdByUid, companyId }) {
  const employeeId = doc(collection(firestoreDb, "companies", companyId, "employees")).id;
  const [photoLocalUri, clientPin] = await Promise.all([
    persistEmployeePhoto(photoUri),
    generateLocalPin(),
  ]);

  const localId = makeLocalId();
  const now = Date.now();

  const sqlite = await getDb();
  await sqlite.runAsync(
    `INSERT INTO employee_queue
      (localId, employeeId, name, photoLocalUri, clientPin, createdByUid, syncStatus, attempts, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    [localId, employeeId, name, photoLocalUri, clientPin, createdByUid, now]
  );
  notifyEmployeeQueueChange();

  return { localId, employeeId, pin: clientPin };
}
