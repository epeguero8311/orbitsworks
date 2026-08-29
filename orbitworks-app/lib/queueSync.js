import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db as firestoreDb, storage } from "./firebase";
import { getDb } from "./db";

let syncing = false;

async function uploadPhoto(companyId, employeeId, localUri) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const filename = `${Date.now()}.jpg`;
  const photoRef = ref(storage, `companies/${companyId}/clockEvents/${employeeId}/${filename}`);
  await uploadBytes(photoRef, blob);
  return getDownloadURL(photoRef);
}

async function syncOne(sqlite, item, companyId) {
  const eventsRef = collection(firestoreDb, "companies", companyId, "clockEvents");

  let photoUrl = null;
  if (item.photoLocalUri) {
    photoUrl = await uploadPhoto(companyId, item.employeeId, item.photoLocalUri);
  }

  await addDoc(eventsRef, {
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    siteId: item.siteId ?? null,
    siteName: item.siteName ?? "Not specified",
    type: item.type,
    source: item.source ?? null,
    photoUrl: photoUrl,
    note: item.note ?? null,
    authorizedById: item.authorizedById ?? null,
    authorizedByName: item.authorizedByName ?? null,
    createdByUid: item.createdByUid,
    clientTimestamp: Timestamp.fromMillis(item.clientTimestamp),
    timestamp: Timestamp.fromMillis(item.clientTimestamp),
    createdAt: Timestamp.fromMillis(item.createdAt),
  });

  if (item.photoLocalUri) {
    await FileSystem.deleteAsync(item.photoLocalUri, { idempotent: true });
  }

  await sqlite.runAsync("DELETE FROM event_queue WHERE localId = ?", [item.localId]);
}

// Drains the local queue oldest-first, so a breakEnd never syncs ahead
// of the breakStart it belongs to. Each item is marked 'syncing' before
// upload starts so a crash mid-upload is visible and gets reset back to
// 'pending' on next launch by resetStuckSyncs.
export async function drainQueue(companyId) {
  if (syncing || !companyId) return;
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  syncing = true;
  try {
    const sqlite = await getDb();
    const pending = await sqlite.getAllAsync(
      "SELECT * FROM event_queue WHERE syncStatus IN ('pending','failed') ORDER BY clientTimestamp ASC"
    );

    for (const item of pending) {
      await sqlite.runAsync("UPDATE event_queue SET syncStatus = 'syncing' WHERE localId = ?", [item.localId]);
      try {
        await syncOne(sqlite, item, companyId);
      } catch (err) {
        console.log("Sync failed for", item.localId, err.message);
        await sqlite.runAsync(
          "UPDATE event_queue SET syncStatus = 'failed', attempts = attempts + 1, lastError = ? WHERE localId = ?",
          [err.message || "Unknown error", item.localId]
        );
      }
    }
  } finally {
    syncing = false;
  }
}

// Anything stuck in 'syncing' means the app was killed mid-upload last
// session - reset it so drainQueue picks it back up rather than leaving
// it stranded forever.
export async function resetStuckSyncs() {
  const sqlite = await getDb();
  await sqlite.runAsync("UPDATE event_queue SET syncStatus = 'pending' WHERE syncStatus = 'syncing'");
}

export async function getPendingCount() {
  const sqlite = await getDb();
  const row = await sqlite.getFirstAsync(
    "SELECT COUNT(*) as c FROM event_queue WHERE syncStatus IN ('pending','syncing','failed')"
  );
  return row ? row.c : 0;
}