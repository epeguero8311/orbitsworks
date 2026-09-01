import * as Crypto from "expo-crypto";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { getDb } from "./db";
import { notifyPinTableChange } from "./pinEvents";

async function hashPin(pin) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

export async function syncPinTable() {
  const getPinSyncTable = httpsCallable(functions, "getPinSyncTable");
  const result = await getPinSyncTable();
  const employees = result.data.employees || [];

  const db = await getDb();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM pin_cache");
    for (const emp of employees) {
      const hashedPin = await hashPin(emp.pin);
      await db.runAsync(
        `INSERT INTO pin_cache
          (employeeId, hashedPin, name, jobTitle, photoUrl, assignedSiteIds, isSupervisor, active, lastEventType, subcontractorId, subcontractorName, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          emp.id,
          hashedPin,
          emp.name,
          emp.jobTitle,
          emp.photoUrl,
          JSON.stringify(emp.assignedSiteIds || []),
          emp.isSupervisor ? 1 : 0,
          emp.active ? 1 : 0,
          emp.lastEventType ?? null,
          emp.subcontractorId ?? null,
          emp.subcontractorName ?? null,
          now,
        ]
      );
    }
  });

  await db.runAsync(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('pinTableLastSync', ?)",
    [String(now)]
  );

  // Notify anything reading from the local cache (e.g. the supervisor's
  // own header avatar) that fresh data is available.
  notifyPinTableChange();

  return { count: employees.length, syncedAt: now };
}

export async function getPinTableLastSync() {
  const db = await getDb();
  const row = await db.getFirstAsync(
    "SELECT value FROM sync_meta WHERE key = 'pinTableLastSync'"
  );
  return row ? Number(row.value) : null;
}

export async function findEmployeeByPinLocal(pin) {
  const db = await getDb();
  const hashedPin = await hashPin(pin);

  const row = await db.getFirstAsync(
    "SELECT * FROM pin_cache WHERE hashedPin = ? AND active = 1",
    [hashedPin]
  );

  if (!row) return null;

  return {
    id: row.employeeId,
    name: row.name,
    jobTitle: row.jobTitle,
    photoUrl: row.photoUrl,
    assignedSiteIds: JSON.parse(row.assignedSiteIds || "[]"),
    isSupervisor: !!row.isSupervisor,
    subcontractorId: row.subcontractorId ?? null,
    subcontractorName: row.subcontractorName ?? null,
  };
}

// Reads one cached employee by id - the fallback source for the
// logged-in supervisor's own name/photo when a live Firestore snapshot
// has not arrived yet (e.g. a fully offline cold start).
export async function getLocalEmployee(employeeId) {
  if (!employeeId) return null;
  const db = await getDb();
  const row = await db.getFirstAsync(
    "SELECT * FROM pin_cache WHERE employeeId = ?",
    [employeeId]
  );
  if (!row) return null;
  return {
    id: row.employeeId,
    name: row.name,
    jobTitle: row.jobTitle,
    photoUrl: row.photoUrl,
    assignedSiteIds: JSON.parse(row.assignedSiteIds || "[]"),
    isSupervisor: !!row.isSupervisor,
    subcontractorId: row.subcontractorId ?? null,
    subcontractorName: row.subcontractorName ?? null,
  };
}