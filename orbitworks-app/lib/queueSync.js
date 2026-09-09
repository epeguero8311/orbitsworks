import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db as firestoreDb, storage } from "./firebase";
import { getDb } from "./db";

let syncing = false;

// How long a synced row stays in event_queue before cleanup deletes it.
// Must stay well above any realistic onSnapshot round-trip delay so the
// overlay in useLocalStatusOverlay.js never falls back to stale live
// data while Firestore is still catching up.
const SYNCED_RETENTION_MS = 60 * 60 * 1000; // 1 hour

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
    subcontractorId: item.subcontractorId ?? null,
    subcontractorName: item.subcontractorName ?? null,
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

  // Do NOT delete on success - mark 'synced' and keep the row instead.
  // Deleting immediately opened a race: the local override in
  // useLocalStatusOverlay disappeared the instant this write finished,
  // but the onSnapshot listener feeding useTodayShift can take a beat
  // to catch up, so the UI flashed back to the pre-sync status until it
  // arrived (the live count flicker). Keeping the row also means
  // getCurrentLocalStatus (clockStatusLocal.js) always resolves from
  // real local history instead of falling back to pin_cache.lastEventType,
  // which only refreshes on pull-to-refresh/login and was the direct
  // cause of the wrong Clock In/Out confirmation message.
  await sqlite.runAsync(
    "UPDATE event_queue SET syncStatus = 'synced' WHERE localId = ?",
    [item.localId]
  );
}

// Purges old synced rows so event_queue doesn't grow unbounded. Safe to
// call often - only ever removes rows already confirmed written to
// Firestore, well past any possible listener catch-up delay.
export async function cleanupSyncedQueueItems() {
  const sqlite = await getDb();
  await sqlite.runAsync(
    "DELETE FROM event_queue WHERE syncStatus = 'synced' AND clientTimestamp < ?",
    [Date.now() - SYNCED_RETENTION_MS]
  );
}

export async function drainQueue(companyId) {
  if (syncing || !companyId) return;
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  syncing = true;
  try {
    await cleanupSyncedQueueItems().catch(() => {});

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
