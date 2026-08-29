import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { doc, setDoc, Timestamp } from "firebase/firestore";
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

// Writes using the queue item's own localId as the Firestore document ID
// (setDoc, not addDoc) so this is safe to run twice. If the app dies
// between the Firestore write succeeding and the local queue row being
// cleaned up, resetStuckSyncs will replay this item on next launch -
// setDoc against the same ID just overwrites the identical document
// instead of creating a second clock event for the same action.
async function syncOne(sqlite, item, companyId) {
  const eventRef = doc(firestoreDb, "companies", companyId, "clockEvents", item.localId);

  let photoUrl = null;
  if (item.photoLocalUri) {
    photoUrl = await uploadPhoto(companyId, item.employeeId, item.photoLocalUri);
  }

  await setDoc(eventRef, {
    localId: item.localId,
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