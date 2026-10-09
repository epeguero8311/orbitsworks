import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import * as Sentry from "@sentry/react-native";
import { db as firestoreDb, storage } from "./firebase";
import { getDb } from "./db";
import { notifyQueueChange } from "./queueEvents";
import { isFaultActive, resolveTimeoutMs, hangForever, fakePermissionDeniedError } from "./syncFaults";

let syncing = false;

// Lets the Sync Queue tab show a live "syncing" state without polling -
// it just reads this alongside its own notifyQueueChange-driven refresh.
export function isQueueSyncing() {
  return syncing;
}

// How long a synced row stays in event_queue before cleanup deletes it.
// Must stay well above any realistic onSnapshot round-trip delay so the
// overlay in useLocalStatusOverlay.js never falls back to stale live
// data while Firestore is still catching up.
const SYNCED_RETENTION_MS = 60 * 60 * 1000; // 1 hour

// Per-step timeouts. None of these can actually abort Firestore/Storage
// network work below the JS layer - they exist so a stalled step (e.g.
// a radio that is "connected" but can't actually reach the internet)
// rejects instead of hanging the for-loop in drainQueue forever. See
// withTimeout/withUploadTimeout below. Every usage below goes through
// resolveTimeoutMs() so the dev-only fault panel can shrink all of them
// at once (lib/syncFaults.js) without touching these production values.
const PHOTO_FETCH_TIMEOUT_MS = 20 * 1000;
const PHOTO_DOWNLOAD_URL_TIMEOUT_MS = 20 * 1000;
const PHOTO_UPLOAD_TIMEOUT_MS = 60 * 1000;
const FIRESTORE_WRITE_TIMEOUT_MS = 30 * 1000;

// Upper bound on how long a single drainQueue() pass may hold the
// `syncing` lock. Exists purely so a hang that somehow isn't caught by
// the per-step timeouts above (or any other bug) can never wedge the
// lock open forever - see the watchdog in drainQueue.
const DRAIN_WATCHDOG_MS = 5 * 60 * 1000;

// After this many failed attempts, an item is parked as 'dead' instead
// of being retried forever. Dead items are excluded from drainQueue but
// never deleted - they keep their photo and lastError so a human can
// inspect and manually retry from the Sync Queue tab.
const DEAD_LETTER_ATTEMPTS = 8;

// Races `promise` against a timer. If the timer wins, rejects with an
// Error whose message is `timeout:<label>` so Sentry/lastError make it
// obvious which step stalled. Does not and cannot cancel `promise` itself
// - see withUploadTimeout for the one step (upload) where cancellation is
// actually possible, and the comment above the setDoc call for why an
// uncancelled Firestore write is still safe.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timeout:${label}`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// uploadBytesResumable returns a thenable UploadTask, not a plain Promise
// - it also exposes cancel(), which withTimeout() has no way to reach.
// This races the same way but calls task.cancel() on timeout so a slow
// upload doesn't keep consuming bandwidth/battery in the background after
// the queue has already moved on and marked the item failed.
function withUploadTimeout(task, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      task.cancel();
      reject(new Error(`timeout:${label}`));
    }, ms);

    // Dev-only: simulate a stalled upload by never attaching the real
    // completion callbacks below, so only the timer above can ever
    // settle this promise - same shape as a genuinely dead connection.
    // The real uploadTask (pointed at the dev Storage bucket) still runs
    // and still gets cancelled when the timer fires.
    if (__DEV__ && isFaultActive("hangUpload")) return;

    task.then(
      (snapshot) => {
        clearTimeout(timer);
        resolve(snapshot);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function uploadPhoto(companyId, employeeId, localUri) {
  const response = await withTimeout(fetch(localUri), resolveTimeoutMs(PHOTO_FETCH_TIMEOUT_MS), "photoFetch");
  const blob = await response.blob();
  const filename = `${Date.now()}.jpg`;
  const photoRef = ref(storage, `companies/${companyId}/clockEvents/${employeeId}/${filename}`);
  const uploadTask = uploadBytesResumable(photoRef, blob);
  await withUploadTimeout(uploadTask, resolveTimeoutMs(PHOTO_UPLOAD_TIMEOUT_MS), "uploadBytesResumable");
  return withTimeout(getDownloadURL(photoRef), resolveTimeoutMs(PHOTO_DOWNLOAD_URL_TIMEOUT_MS), "getDownloadURL");
}

// Writes using the queue item's own localId as the Firestore document ID
// (setDoc, not addDoc) so this is safe to run twice. If the app dies
// between the Firestore write succeeding and the local queue row being
// cleaned up, resetStuckSyncs will replay this item on next launch -
// setDoc against the same ID just overwrites the identical document
// instead of creating a second clock event for the same action.
async function syncOne(sqlite, item, companyId) {
  const eventRef = doc(firestoreDb, "companies", companyId, "clockEvents", item.localId);

  Sentry.addBreadcrumb({
    category: "queueSync",
    message: "syncOne:start",
    level: "info",
    data: {
      localId: item.localId,
      employeeId: item.employeeId,
      type: item.type,
      source: item.source,
      hasPhoto: !!item.photoLocalUri,
      attempts: item.attempts,
    },
  });

  let photoUrl = null;
  if (item.photoLocalUri) {
    photoUrl = await uploadPhoto(companyId, item.employeeId, item.photoLocalUri);
    Sentry.addBreadcrumb({
      category: "queueSync",
      message: "syncOne:photoUploaded",
      level: "info",
      data: { localId: item.localId },
    });
  }

  // Dev-only fault injection: swap the real Firestore write for either a
  // promise that never settles (hangSetDoc) or one that rejects exactly
  // like a rules rejection would (failSetDoc) - never actually touching
  // Firestore in either case. Both are only reachable with __DEV__ true,
  // see lib/syncFaults.js for the guarantee.
  let writePromise;
  if (__DEV__ && isFaultActive("hangSetDoc")) {
    writePromise = hangForever();
  } else if (__DEV__ && isFaultActive("failSetDoc")) {
    writePromise = Promise.reject(fakePermissionDeniedError());
  } else {
    // Timing out here does NOT cancel the write - a Firestore setDoc()
    // call that is already in flight when the timer fires may still
    // reach the server and land later, there is no client-side way to
    // abort it. That is fine: the doc id is this item's stable localId,
    // so whether this timeout causes a retry (another setDoc with the
    // same id) or the original delayed write lands after the retry
    // already succeeded, isIdempotentReplay in firestore.rules only
    // allows a same-identity replay of the same event - never a
    // duplicate clock event, never a silently lost one.
    writePromise = setDoc(eventRef, {
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
      reason: item.reason ?? null,
      overrideEventId: item.overrideEventId ?? null,
      deviceId: item.deviceId ?? null,
      deviceNameSnapshot: item.deviceNameSnapshot ?? null,
      // Omitted entirely (not even null) for a Core-plan company, where
      // clockQueue.js never attempts a fix at all - that's what makes the
      // dashboard show nothing for these, same as a pre-feature event.
      // locationAttempted=1 means it did attempt (a Pro company): location
      // is either the raw fix or null (denied/timeout - shows "Location not
      // shared"). onClockEventCreated fills in locationAddress/
      // distanceFromSiteM server-side; this client never computes either.
      ...(item.locationAttempted
        ? {
            location: item.lat != null && item.lng != null ? { lat: item.lat, lng: item.lng } : null,
            locationAccuracyM: item.locationAccuracyM ?? null,
          }
        : {}),
      createdByUid: item.createdByUid,
      clientTimestamp: Timestamp.fromMillis(item.clientTimestamp),
      timestamp: Timestamp.fromMillis(item.clientTimestamp),
      createdAt: Timestamp.fromMillis(item.createdAt),
    });
  }

  await withTimeout(writePromise, resolveTimeoutMs(FIRESTORE_WRITE_TIMEOUT_MS), "setDoc");

  Sentry.addBreadcrumb({
    category: "queueSync",
    message: "syncOne:firestoreWritten",
    level: "info",
    data: { localId: item.localId },
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
    "UPDATE event_queue SET syncStatus = 'synced', syncedAt = ? WHERE localId = ?",
    [Date.now(), item.localId]
  );
  notifyQueueChange();
}

// Purges old synced rows so event_queue doesn't grow unbounded. Safe to
// call often - only ever removes rows already confirmed written to
// Firestore, well past any possible listener catch-up delay. 'dead' rows
// are never touched here - they're kept indefinitely for manual review.
export async function cleanupSyncedQueueItems() {
  const sqlite = await getDb();
  await sqlite.runAsync(
    "DELETE FROM event_queue WHERE syncStatus = 'synced' AND clientTimestamp < ?",
    [Date.now() - SYNCED_RETENTION_MS]
  );
  notifyQueueChange();
}

export async function drainQueue(companyId) {
  if (syncing || !companyId) return;

  // isConnected only means "attached to a network interface," not "that
  // network can actually reach the internet" - a job-site wifi with a
  // dead backhaul, or a weak cell signal, can report isConnected: true
  // while every request past this point would hang. isInternetReachable
  // is NetInfo's actual reachability probe; treat only a confirmed-false
  // as a reason to skip (null/undefined means "still checking," and we'd
  // rather attempt and let the per-step timeouts below catch a bad
  // network than wait indefinitely for a reachability verdict that may
  // never arrive either).
  const net = await NetInfo.fetch();
  if (!net.isConnected || net.isInternetReachable === false) {
    Sentry.addBreadcrumb({
      category: "queueSync",
      message: "drainQueue:skipped-offline",
      level: "info",
      data: { isConnected: net.isConnected, isInternetReachable: net.isInternetReachable },
    });
    return;
  }

  syncing = true;
  notifyQueueChange();

  // The lock above must never be held forever. The per-step timeouts in
  // syncOne/uploadPhoto are the first line of defense, but this watchdog
  // is the backstop: if a full drain pass is still running after 5
  // minutes (10s in dev when the fault panel's timeout override is set)
  // - whatever the reason - force the lock open so the next trigger
  // (NetInfo, AppState, the poll interval, resetStuckSyncs) can try
  // again instead of every future sync silently no-op'ing against a
  // lock that will never clear on its own.
  const watchdog = setTimeout(() => {
    if (!syncing) return;
    Sentry.captureMessage("queueSync:watchdog-forced-unlock", {
      level: "warning",
      tags: { area: "queueSync" },
      contexts: {
        queueSync: { companyId, maxDrainMs: resolveTimeoutMs(DRAIN_WATCHDOG_MS) },
      },
    });
    syncing = false;
    notifyQueueChange();
  }, resolveTimeoutMs(DRAIN_WATCHDOG_MS));

  try {
    // Dev-only: hang before any item is even picked up, bypassing every
    // per-item try/catch below entirely. This is the one fault that
    // exercises the watchdog as a true last resort rather than the
    // per-step timeouts in syncOne/uploadPhoto.
    if (__DEV__ && isFaultActive("hangWholeDrain")) {
      await hangForever();
    }

    await cleanupSyncedQueueItems().catch(() => {});

    const sqlite = await getDb();
    const pending = await sqlite.getAllAsync(
      "SELECT * FROM event_queue WHERE syncStatus IN ('pending','failed') ORDER BY clientTimestamp ASC"
    );

    Sentry.addBreadcrumb({
      category: "queueSync",
      message: "drainQueue:start",
      level: "info",
      data: { companyId, pendingCount: pending.length },
    });

    let syncedCount = 0;
    let failedCount = 0;
    let deadCount = 0;

    for (const item of pending) {
      await sqlite.runAsync("UPDATE event_queue SET syncStatus = 'syncing' WHERE localId = ?", [item.localId]);
      notifyQueueChange();
      try {
        await syncOne(sqlite, item, companyId);
        syncedCount++;
      } catch (err) {
        console.log("Sync failed for", item.localId, err.message);
        failedCount++;

        const nextAttempts = (item.attempts || 0) + 1;
        const isDead = nextAttempts >= DEAD_LETTER_ATTEMPTS;
        if (isDead) deadCount++;

        // A persistent failure (attempts keeps climbing) means this item
        // will never sync on its own - e.g. a Firestore rules rejection,
        // a malformed field, or a step that keeps timing out - as
        // opposed to a one-off network blip. Report every failure so
        // Sentry's grouping/count shows which this is; tag by attempts
        // bucket and dead-letter state so a chronically-stuck item
        // stands out from a first-try retry in the issue list.
        Sentry.captureException(err, {
          tags: {
            area: "queueSync",
            eventType: item.type,
            source: item.source ?? "unknown",
            persistent: item.attempts >= 2 ? "true" : "false",
            deadLetter: isDead ? "true" : "false",
            timedOut: typeof err.message === "string" && err.message.startsWith("timeout:") ? "true" : "false",
          },
          contexts: {
            clockQueueItem: {
              localId: item.localId,
              companyId,
              employeeId: item.employeeId,
              type: item.type,
              source: item.source,
              attempts: nextAttempts,
              hasPhoto: !!item.photoLocalUri,
              errorMessage: err.message,
              errorCode: err.code,
            },
          },
        });

        await sqlite.runAsync(
          "UPDATE event_queue SET syncStatus = ?, attempts = ?, lastError = ? WHERE localId = ?",
          [isDead ? "dead" : "failed", nextAttempts, err.message || "Unknown error", item.localId]
        );
        notifyQueueChange();
      }
    }

    Sentry.addBreadcrumb({
      category: "queueSync",
      message: "drainQueue:finished",
      level: "info",
      data: { companyId, syncedCount, failedCount, deadCount },
    });

    // Records that a drain pass ran to completion (online, reached
    // Firestore) - independent of whether every individual item
    // succeeded; per-item failures stay visible in the Sync Queue tab
    // itself. Drives Settings' "last successful sync" display.
    await sqlite
      .runAsync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('queueLastSync', ?)", [String(Date.now())])
      .catch(() => {});
    notifyQueueChange();
  } finally {
    clearTimeout(watchdog);
    syncing = false;
    notifyQueueChange();
  }
}

export async function resetStuckSyncs() {
  const sqlite = await getDb();
  await sqlite.runAsync("UPDATE event_queue SET syncStatus = 'pending' WHERE syncStatus = 'syncing'");
  notifyQueueChange();
}

// Manual recovery for a 'dead' item from the Sync Queue tab - clears the
// attempt count and lastError and puts it back in line for the next
// drain. Never used automatically; dead-lettering only happens from
// exhausted automatic retries, so un-dead-lettering is a human decision.
export async function retryQueueItem(localId) {
  const sqlite = await getDb();
  await sqlite.runAsync(
    "UPDATE event_queue SET syncStatus = 'pending', attempts = 0, lastError = NULL WHERE localId = ?",
    [localId]
  );
  notifyQueueChange();
}

export async function getPendingCount() {
  const sqlite = await getDb();
  const row = await sqlite.getFirstAsync(
    "SELECT COUNT(*) as c FROM event_queue WHERE syncStatus IN ('pending','syncing','failed')"
  );
  return row ? row.c : 0;
}

export async function getLastSyncTime() {
  const sqlite = await getDb();
  const row = await sqlite.getFirstAsync("SELECT value FROM sync_meta WHERE key = 'queueLastSync'");
  return row ? Number(row.value) : null;
}
