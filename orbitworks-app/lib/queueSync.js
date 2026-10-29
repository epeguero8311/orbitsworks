import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import * as Sentry from "@sentry/react-native";
import { db as firestoreDb, storage, auth } from "./firebase";
import { getDb, runExclusive } from "./db";
import { notifyQueueChange } from "./queueEvents";
import { isFaultActive, resolveTimeoutMs, hangForever, fakePermissionDeniedError } from "./syncFaults";
import { uploadLocalFileToStorage } from "./storageUpload";

let syncing = false;

// Bumped every time a drain starts, and again whenever the stall
// detector below forcibly abandons one. A drain captures its own value
// at start (myEpoch) and checks it against the current one at every
// checkpoint - success, failure, or the top of the next loop iteration.
// If they no longer match, this drain has been abandoned (the lock was
// forced open so a fresher drain could run) and must stop touching
// anything immediately: no more SQLite writes, no more counters, no
// clobbering a row a newer drain may have already finished. This is
// what keeps "force the lock open" from re-introducing the two-drains-
// at-once bug it exists to prevent.
let currentEpoch = 0;

// Which item (if any) the current drain is in the middle of - purely so
// a stall report in Sentry says which punch was stuck, not just "a
// drain" (see the stall detector in drainQueue).
let inFlightLocalId = null;

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
// a radio that is "connected" but can't actually reach the internet, or
// a corrupt local file that never finishes decoding) rejects instead of
// hanging forever. Every usage below goes through resolveTimeoutMs() so
// the dev-only fault panel can shrink all of them at once without
// touching these production values.
const PHOTO_STAT_TIMEOUT_MS = 10 * 1000;
// Only used to time a dev fault-injection hang (see uploadPhoto's
// hangPhotoBlob check) - there's no longer a separate real read step to
// time, since uploadLocalFileToStorage reads the file natively as part
// of the upload itself.
const PHOTO_BLOB_TIMEOUT_MS = 20 * 1000;
const PHOTO_UPLOAD_TIMEOUT_MS = 60 * 1000;
const PHOTO_DOWNLOAD_URL_TIMEOUT_MS = 20 * 1000;
const FIRESTORE_WRITE_TIMEOUT_MS = 30 * 1000;

// Per-item ceiling (the 1.0.10 fix): the sum of every step above that a
// single item can go through -
//   photoStat(10) + upload(60) +
//   getDownloadURL(20) + setDoc(30) = 120s worst case.
// PER_ITEM_TIMEOUT_MS sits ~75s / ~63% above that sum, so it only ever
// fires for a step with no timeout of its own - known or future - never
// by racing a step that is already correctly timed. This is what
// actually stops one item from blocking the rest of the queue: even a
// completely unanticipated hang anywhere inside syncOne can cost this
// item at most ~3.5 minutes before the loop moves on.
const PER_ITEM_TIMEOUT_MS = 210 * 1000;

// The backstop for a hang OUTSIDE the per-item loop (e.g. in getDb(),
// the initial pending-rows query, or cleanupSyncedQueueItems()) - the
// one class of hang the per-item timeout above cannot reach. An 85-item
// drain grinding through items one at a time, each well under
// PER_ITEM_TIMEOUT_MS, never comes close to this: it only fires when
// NOTHING has finished in a long time, not because the drain has been
// running for a while. That is the fix for the old fixed 5-minute
// watchdog, which killed the whole pass on a clock, whether or not it
// was making progress.
const STALL_THRESHOLD_MS = 2 * PER_ITEM_TIMEOUT_MS; // 420s / 7 min
const STALL_CHECK_INTERVAL_MS = 15 * 1000;

// Best-effort timeouts for work that must never affect whether an item
// counts as synced: backing it up and cleaning up its photo file after
// success. Deliberately NOT part of the per-item budget above.
const BACKUP_TIMEOUT_MS = 10 * 1000;
const PHOTO_CLEANUP_TIMEOUT_MS = 10 * 1000;

// After this many failed attempts, an item is parked as 'dead' instead
// of being retried forever. Dead items are excluded from drainQueue but
// never deleted - they keep their photo and lastError so a human can
// inspect and manually retry from the Sync Queue tab. A structurally
// invalid item (see validateQueueItem) skips straight to 'dead' - no
// retry count can ever fix a missing employeeId, so burning 8 attempts
// on it only delays quarantining it.
const DEAD_LETTER_ATTEMPTS = 8;

// Races `promise` against a timer. If the timer wins, rejects with an
// Error whose message is `timeout:<label>` so Sentry/lastError make it
// obvious which step stalled. Does not and cannot cancel `promise`
// itself - see the comment above the setDoc call for why an uncancelled
// Firestore write is still safe; uploadLocalFileToStorage's underlying
// native upload similarly keeps running in the background after a
// timeout here, it just stops being awaited.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timeout:${label}`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const CLOCK_PHOTOS_DIR_NAME = "clockPhotos/";

// Confirms a locally-stored photo is actually usable before spending a
// network round trip on it, and repairs the one specific way a stored
// path can go stale: iOS can change an app's container path across an
// update, so an OLD absolute path baked in at save time (documentDirectory
// + "clockPhotos/<file>") may no longer resolve even though the file
// itself is still sitting at the same place under the CURRENT
// documentDirectory. Only the "clockPhotos/<file>" suffix is trusted for
// the repair - never an arbitrary path.
//
// Returns { uri, info } for a confirmed-usable file, or null if the
// file is genuinely missing or empty even after the repair attempt.
// Letting getInfoAsync's own timeout rejection propagate (rather than
// catching it here) is deliberate: a stat call that itself hangs is not
// positive proof the file is bad, so it must NOT be treated as "drop
// the photo" - see uploadPhotoForItem's caller for that distinction.
async function resolvePhotoUri(storedUri) {
  const info = await withTimeout(
    FileSystem.getInfoAsync(storedUri),
    resolveTimeoutMs(PHOTO_STAT_TIMEOUT_MS),
    "photoStat"
  );
  if (info.exists && info.size > 0) return { uri: storedUri, info };

  const idx = storedUri.indexOf(CLOCK_PHOTOS_DIR_NAME);
  if (idx !== -1) {
    const repairedUri = `${FileSystem.documentDirectory}${storedUri.slice(idx)}`;
    if (repairedUri !== storedUri) {
      const repairedInfo = await withTimeout(
        FileSystem.getInfoAsync(repairedUri),
        resolveTimeoutMs(PHOTO_STAT_TIMEOUT_MS),
        "photoStat"
      );
      if (repairedInfo.exists && repairedInfo.size > 0) return { uri: repairedUri, info: repairedInfo };
    }
  }
  return null;
}

// Uploads via storageUpload.js's uploadLocalFileToStorage rather than the
// Firebase SDK's own uploadBytes/uploadBytesResumable - both confirmed
// broken on this React Native/Android setup (see that file for the two
// separate device-log-confirmed failures). It reads the file natively as
// part of the upload itself, so there's no separate JS-side byte-read
// step left to guard - FileSystem.getInfoAsync's exists/size > 0 check
// in resolvePhotoUri (this function's only caller) is what now stands in
// for the old "read back empty" guard.
async function uploadPhoto(companyId, employeeId, localUri, timing) {
  // Dev-only: simulate the local-read step hanging - see
  // DevSyncFaultPanel.js's hangPhotoBlob switch.
  if (__DEV__ && isFaultActive("hangPhotoBlob")) {
    await withTimeout(hangForever(), resolveTimeoutMs(PHOTO_BLOB_TIMEOUT_MS), "photoBlob");
  }

  const filename = `${Date.now()}.jpg`;
  const photoRef = ref(storage, `companies/${companyId}/clockEvents/${employeeId}/${filename}`);

  // Dev-only: simulate the upload step hanging - see
  // DevSyncFaultPanel.js's hangUpload switch.
  const uploadPromise = __DEV__ && isFaultActive("hangUpload")
    ? hangForever()
    : uploadLocalFileToStorage(photoRef, localUri, "image/jpeg");
  let stepStart = Date.now();
  await withTimeout(uploadPromise, resolveTimeoutMs(PHOTO_UPLOAD_TIMEOUT_MS), "uploadBytesResumable");
  timing.uploadMs = Date.now() - stepStart;
  stepStart = Date.now();
  const url = await withTimeout(getDownloadURL(photoRef), resolveTimeoutMs(PHOTO_DOWNLOAD_URL_TIMEOUT_MS), "getDownloadURL");
  timing.downloadUrlMs = Date.now() - stepStart;
  return url;
}

// Sync-speed measurement: one item's timings, in ms. A breadcrumb (rides
// along on any later Sentry error) and a "[sync-timing]" console line
// (Metro / device logs). Slow syncs are reported to Sentry at most once
// per drain - see the end of drainQueue - so a slow network can't flood it.
const SLOW_SYNC_REPORT_MS = 15 * 1000;

function logSyncTiming(item, timing, outcome, trigger) {
  const data = {
    localId: item.localId,
    type: item.type,
    outcome,
    trigger,
    attempts: item.attempts || 0,
    ...timing,
  };
  Sentry.addBreadcrumb({ category: "queueSync", message: "syncOne:timing", level: "info", data });
  console.log("[sync-timing]", JSON.stringify(data));
  return data;
}

// Hard structural validation (goal 9): catches data that is broken, not
// merely suspicious. Deliberately narrow - only fields that make the
// item impossible to write or impossible to interpret at all. Never
// attempts to fix or guess a value; a failure here always means
// straight-to-dead quarantine, not a retry.
function validateQueueItem(item) {
  if (!item.localId || typeof item.localId !== "string") return "Missing localId";
  if (!item.employeeId || typeof item.employeeId !== "string") return "Missing employee ID";
  if (!item.createdByUid || typeof item.createdByUid !== "string") return "Missing createdByUid";
  if (!["in", "out", "breakStart", "breakEnd"].includes(item.type)) {
    return `Invalid clock type: ${JSON.stringify(item.type)}`;
  }
  if (!Number.isFinite(item.clientTimestamp) || item.clientTimestamp <= 0) return "Invalid clock time";
  if (!Number.isFinite(item.createdAt) || item.createdAt <= 0) return "Invalid createdAt";
  return null;
}

// Best-effort, one-time, off-phone copy of an item's raw local fields -
// written BEFORE validation or sync so even a structurally-broken item
// (which will never reach Firestore as a real clock event) still has
// its original values preserved somewhere an admin can see them. Keyed
// by localId (idempotent - safe to call again, and skipped entirely
// once the local `backedUp` flag is set). A failure here is logged but
// never allowed to block the real sync attempt - this is a safety net,
// not another single point that can stall the queue.
async function backupItemIfNeeded(sqlite, companyId, item) {
  if (item.backedUp) return;
  try {
    const backupRef = doc(firestoreDb, "companies", companyId, "queueBackups", item.localId);
    await withTimeout(
      setDoc(backupRef, {
        localId: item.localId,
        employeeId: item.employeeId ?? null,
        employeeName: item.employeeName ?? null,
        siteId: item.siteId ?? null,
        siteName: item.siteName ?? null,
        type: item.type ?? null,
        note: item.note ?? null,
        source: item.source ?? null,
        authorizedById: item.authorizedById ?? null,
        authorizedByName: item.authorizedByName ?? null,
        createdByUid: item.createdByUid ?? null,
        clientTimestamp: item.clientTimestamp ?? null,
        subcontractorId: item.subcontractorId ?? null,
        subcontractorName: item.subcontractorName ?? null,
        reason: item.reason ?? null,
        overrideEventId: item.overrideEventId ?? null,
        createdAt: item.createdAt ?? null,
        attempts: item.attempts ?? 0,
        lastError: item.lastError ?? null,
        hadPhoto: !!item.photoLocalUri,
        backedUpByUid: auth.currentUser ? auth.currentUser.uid : null,
        backedUpAt: Timestamp.now(),
      }),
      resolveTimeoutMs(BACKUP_TIMEOUT_MS),
      "queueBackup"
    );
    await runExclusive(() =>
      sqlite.runAsync("UPDATE event_queue SET backedUp = 1 WHERE localId = ?", [item.localId])
    );
  } catch (err) {
    Sentry.captureMessage("queueSync:backupFailed", {
      level: "warning",
      tags: { area: "queueSync", localId: item.localId },
      contexts: { queueBackup: { errorMessage: err.message } },
    });
  }
}

// Writes using the queue item's own localId as the Firestore document ID
// (setDoc, not addDoc) so this is safe to run twice. If the app dies
// between the Firestore write succeeding and the local queue row being
// cleaned up, resetStuckSyncs will replay this item on next launch -
// setDoc against the same ID just overwrites the identical document
// instead of creating a second clock event for the same action.
async function syncOne(sqlite, item, companyId, timing) {
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
  let resolvedPhoto = null;
  if (item.photoLocalUri) {
    // A positive, completed stat result (file missing, or present but
    // 0 bytes) is the ONLY thing that drops the photo (goal 6/8). A stat
    // call that itself throws/times out is not proof the file is bad -
    // it propagates normally below and fails the whole item instead, so
    // it gets retried later with the photo still attached, not dropped.
    const statStart = Date.now();
    resolvedPhoto = await resolvePhotoUri(item.photoLocalUri);
    timing.photoStatMs = Date.now() - statStart;
    if (resolvedPhoto) timing.photoBytes = resolvedPhoto.info.size;
    if (!resolvedPhoto) {
      Sentry.captureMessage("queueSync:photoDropped", {
        level: "warning",
        tags: { area: "queueSync", localId: item.localId, reason: "missing-or-empty" },
        contexts: { photo: { storedUri: item.photoLocalUri } },
      });
    } else {
      Sentry.addBreadcrumb({
        category: "queueSync",
        message: "syncOne:photoFound",
        level: "info",
        data: {
          localId: item.localId,
          fileSize: resolvedPhoto.info.size,
          repaired: resolvedPhoto.uri !== item.photoLocalUri,
        },
      });
      // Any failure from here on (network, upload, timeout) is ambiguous
      // - not proof the file is bad - so it propagates up and fails the
      // whole item normally, keeping photoLocalUri for the next retry.
      photoUrl = await uploadPhoto(companyId, item.employeeId, resolvedPhoto.uri, timing);
      Sentry.addBreadcrumb({
        category: "queueSync",
        message: "syncOne:photoUploaded",
        level: "info",
        data: { localId: item.localId },
      });
    }
  }

  // Dev-only fault injection: swap the real Firestore write for either a
  // promise that never settles (hangSetDoc) or one that rejects exactly
  // like a rules rejection would (failSetDoc) - never actually touching
  // Firestore in either case. Both are only reachable with __DEV__ true,
  // see lib/syncFaults.js for the guarantee.
  const payload = {
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
  };

  let writePromise;
  if (__DEV__ && isFaultActive("hangSetDoc")) {
    writePromise = hangForever();
  } else if (__DEV__ && isFaultActive("failSetDoc")) {
    writePromise = Promise.reject(fakePermissionDeniedError());
  } else {
    // merge: true, not a plain overwrite - this matters even for an
    // ordinary first write, not just a retry. onClockEventCreated adds
    // fields this payload never includes (geofenceStatus, siteAutoDetected,
    // deviceId, etc. - see firestore.rules' clockEvents update denylist).
    // A plain (non-merge) setDoc REPLACES the whole document, which would
    // DELETE those server-added fields on any later write to this same
    // id - and Firestore rules treat a removed field as an "affected key"
    // just like a changed one, so that delete alone is enough to land on
    // the denylist and get rejected with permission-denied, even though
    // every client-owned field is byte-identical to what's already there.
    // That is exactly the timeout-then-retry case this code exists to
    // make safe: timing out here does NOT cancel the write, so a retry
    // can run against a doc the original (merely slow) write already
    // enriched. With merge: true, the retry only ever touches the fields
    // listed in payload - every server-added field is left untouched on
    // both sides of the diff, so isIdempotentReplay's identity check is
    // what actually decides it, not an accidental field deletion.
    writePromise = setDoc(eventRef, payload, { merge: true });
  }

  const writeStart = Date.now();
  try {
    await withTimeout(writePromise, resolveTimeoutMs(FIRESTORE_WRITE_TIMEOUT_MS), "setDoc");
    timing.writeMs = Date.now() - writeStart;
    timing.tapToServerMs = Date.now() - item.createdAt;
  } catch (err) {
    timing.writeMs = Date.now() - writeStart;
    // Belt-and-suspenders for the exact scenario merge:true exists to
    // prevent, in case some other field or rule neither of us has
    // thought of yet still causes a rejection: if the server says
    // permission-denied, check whether a matching-identity document
    // already exists under this id - if so, a prior attempt's write
    // already landed for real, and this must count as synced, never
    // Stuck. Only trusts a doc whose core identity fields match this
    // item's own; never accepts an unrelated doc that happens to share
    // the id.
    if (err && err.code === "permission-denied") {
      try {
        const existingSnap = await getDoc(eventRef);
        const existing = existingSnap.exists() ? existingSnap.data() : null;
        if (
          existing &&
          existing.localId === item.localId &&
          existing.employeeId === item.employeeId &&
          existing.type === item.type &&
          existing.createdByUid === item.createdByUid
        ) {
          Sentry.addBreadcrumb({
            category: "queueSync",
            message: "syncOne:alreadyLanded",
            level: "info",
            data: { localId: item.localId },
          });
          timing.alreadyLanded = true;
          timing.tapToServerMs = Date.now() - item.createdAt;
          await finalizeSynced(sqlite, item, resolvedPhoto);
          return;
        }
      } catch {
        // Re-read itself failed - fall through to normal failure handling.
      }
    }

    // A genuine server rejection (rules denial, wrong account/company) -
    // attach exactly what we tried to write so Sentry shows the real
    // field values, not just that it failed (goal 11).
    if (err && err.code && err.code !== "timeout") {
      err.rejectedPayload = {
        ...payload,
        clientTimestamp: item.clientTimestamp,
        timestamp: item.clientTimestamp,
        createdAt: item.createdAt,
      };
    }
    if (resolvedPhoto) err.photoDiagnostics = { exists: true, size: resolvedPhoto.info.size };
    else if (item.photoLocalUri) err.photoDiagnostics = { exists: false, size: 0 };
    throw err;
  }

  Sentry.addBreadcrumb({
    category: "queueSync",
    message: "syncOne:firestoreWritten",
    level: "info",
    data: { localId: item.localId },
  });

  await finalizeSynced(sqlite, item, resolvedPhoto);
}

// Shared tail for both the normal success path and the "it already
// landed under a prior attempt" fallback above - marks the row synced
// and best-effort cleans up its local photo, identically either way.
async function finalizeSynced(sqlite, item, resolvedPhoto) {
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
  await runExclusive(() =>
    sqlite.runAsync(
      "UPDATE event_queue SET syncStatus = 'synced', syncedAt = ? WHERE localId = ?",
      [Date.now(), item.localId]
    )
  );
  notifyQueueChange();

  // Fire-and-forget: cleanup must never retroactively affect an already-
  // successful sync. Not awaited, own short timeout, errors just logged.
  if (resolvedPhoto) {
    withTimeout(
      FileSystem.deleteAsync(resolvedPhoto.uri, { idempotent: true }),
      resolveTimeoutMs(PHOTO_CLEANUP_TIMEOUT_MS),
      "photoCleanup"
    ).catch((err) => {
      Sentry.captureMessage("queueSync:photoCleanupFailed", {
        level: "warning",
        tags: { area: "queueSync", localId: item.localId },
        contexts: { error: { message: err.message } },
      });
    });
  }
}

// Purges old synced rows so event_queue doesn't grow unbounded. Safe to
// call often - only ever removes rows already confirmed written to
// Firestore, well past any possible listener catch-up delay. 'dead' rows
// are never touched here - they're kept indefinitely for manual review.
export async function cleanupSyncedQueueItems() {
  const sqlite = await getDb();
  await runExclusive(() =>
    sqlite.runAsync(
      "DELETE FROM event_queue WHERE syncStatus = 'synced' AND clientTimestamp < ?",
      [Date.now() - SYNCED_RETENTION_MS]
    )
  );
  notifyQueueChange();
}

// Reads every pending/failed row for a drain pass. If the batch query
// itself throws (goal 12 - a single unreadable row can poison a SELECT *
// on some SQLite driver paths), falls back to reading just the id
// column, then hydrating each row one at a time so a single corrupted
// row can be skipped-and-logged instead of blocking every other item's
// read.
async function readPendingItems(sqlite) {
  try {
    return await sqlite.getAllAsync(
      "SELECT * FROM event_queue WHERE syncStatus IN ('pending','failed') ORDER BY clientTimestamp ASC"
    );
  } catch (batchErr) {
    Sentry.captureException(batchErr, { tags: { area: "queueSync", step: "batchRead" } });

    let ids = [];
    try {
      ids = await sqlite.getAllAsync(
        "SELECT localId FROM event_queue WHERE syncStatus IN ('pending','failed') ORDER BY clientTimestamp ASC"
      );
    } catch (idsErr) {
      Sentry.captureException(idsErr, { tags: { area: "queueSync", step: "batchReadFallbackIds" } });
      return [];
    }

    const rows = [];
    for (const { localId } of ids) {
      try {
        const row = await sqlite.getFirstAsync("SELECT * FROM event_queue WHERE localId = ?", [localId]);
        if (row) rows.push(row);
      } catch (rowErr) {
        Sentry.captureException(rowErr, {
          tags: { area: "queueSync", step: "rowRead" },
          contexts: { row: { localId } },
        });
      }
    }
    return rows;
  }
}

// `trigger` is measurement-only (which caller started this drain - see
// logSyncTiming); it never changes behavior.
export async function drainQueue(companyId, trigger = "other") {
  if (syncing || !companyId) {
    if (companyId) {
      Sentry.addBreadcrumb({
        category: "queueSync",
        message: "drainQueue:skipped-busy",
        level: "info",
        data: { trigger },
      });
    }
    return;
  }
  const drainStartAt = Date.now();

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

  const myEpoch = ++currentEpoch;
  syncing = true;
  notifyQueueChange();

  let lastProgressAt = Date.now();

  // The lock above must never be held forever, but a FIXED total-duration
  // cap is the wrong invariant for a queue that can legitimately take
  // longer than any fixed number to drain (an 85-item backlog, each
  // taking a few real seconds, easily clears 5 minutes while perfectly
  // healthy). This only fires when NOTHING has finished - success or
  // failure - in STALL_THRESHOLD_MS, i.e. truly stuck, not just long.
  //
  // Firing here does not stop whatever is currently in flight inside
  // this drain - it can't, there's no cancellation token that reaches
  // into syncOne. What it does is bump currentEpoch, making myEpoch
  // stale. This drain checks that at every checkpoint (top of the loop,
  // and right after any item settles) and stops touching the database
  // the moment it notices - so even though it may still be "running" in
  // the background for up to one more PER_ITEM_TIMEOUT_MS, it can never
  // again write a status that could clobber what a newer drain does.
  const stallCheck = setInterval(() => {
    if (myEpoch !== currentEpoch) {
      clearInterval(stallCheck);
      return;
    }
    if (Date.now() - lastProgressAt > resolveTimeoutMs(STALL_THRESHOLD_MS)) {
      Sentry.captureMessage("queueSync:stall-forced-unlock", {
        level: "warning",
        tags: { area: "queueSync" },
        contexts: {
          queueSync: { companyId, inFlightLocalId, stallThresholdMs: resolveTimeoutMs(STALL_THRESHOLD_MS) },
        },
      });
      currentEpoch++;
      syncing = false;
      notifyQueueChange();
      clearInterval(stallCheck);
    }
  }, resolveTimeoutMs(STALL_CHECK_INTERVAL_MS));

  try {
    // Dev-only: hang before any item is even picked up, bypassing every
    // per-item try/catch below entirely. This is the one fault that
    // exercises the stall detector as a true last resort rather than the
    // per-item timeout below.
    if (__DEV__ && isFaultActive("hangWholeDrain")) {
      await hangForever();
    }

    await cleanupSyncedQueueItems().catch(() => {});

    const sqlite = await getDb();
    const pending = await readPendingItems(sqlite);

    Sentry.addBreadcrumb({
      category: "queueSync",
      message: "drainQueue:start",
      level: "info",
      data: { companyId, pendingCount: pending.length },
    });

    let syncedCount = 0;
    let failedCount = 0;
    let deadCount = 0;
    let slowCount = 0;
    let slowest = null;

    for (const item of pending) {
      if (myEpoch !== currentEpoch) break;
      inFlightLocalId = item.localId;

      await runExclusive(() =>
        sqlite.runAsync("UPDATE event_queue SET syncStatus = 'syncing' WHERE localId = ?", [item.localId])
      );
      notifyQueueChange();

      const timing = { queueWaitMs: Date.now() - item.createdAt, drainAgeMs: Date.now() - drainStartAt };

      // Best-effort, never throws, never blocks the real attempt below.
      const backupStart = Date.now();
      await backupItemIfNeeded(sqlite, companyId, item);
      timing.backupMs = Date.now() - backupStart;

      try {
        const validationError = validateQueueItem(item);
        if (validationError) {
          const err = new Error(`invalid:${validationError}`);
          err.code = "queue-validation";
          throw err;
        }

        await withTimeout(syncOne(sqlite, item, companyId, timing), resolveTimeoutMs(PER_ITEM_TIMEOUT_MS), "item");

        if (myEpoch !== currentEpoch) break;
        syncedCount++;
        lastProgressAt = Date.now();
        const logged = logSyncTiming(item, timing, "synced", trigger);
        if (timing.tapToServerMs > SLOW_SYNC_REPORT_MS) {
          slowCount++;
          if (!slowest || timing.tapToServerMs > slowest.tapToServerMs) slowest = logged;
        }
      } catch (err) {
        if (myEpoch !== currentEpoch) break;

        logSyncTiming(item, { ...timing, error: err.message }, "failed", trigger);
        console.log("Sync failed for", item.localId, err.message);
        failedCount++;

        const isValidationFailure = err.code === "queue-validation";
        const nextAttempts = (item.attempts || 0) + 1;
        const isDead = isValidationFailure || nextAttempts >= DEAD_LETTER_ATTEMPTS;
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
            invalid: isValidationFailure ? "true" : "false",
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
            ...(err.photoDiagnostics ? { photo: err.photoDiagnostics } : {}),
            ...(err.rejectedPayload ? { rejectedPayload: err.rejectedPayload } : {}),
          },
        });

        await runExclusive(() =>
          sqlite.runAsync(
            "UPDATE event_queue SET syncStatus = ?, attempts = ?, lastError = ? WHERE localId = ?",
            [isDead ? "dead" : "failed", nextAttempts, err.message || "Unknown error", item.localId]
          )
        );
        notifyQueueChange();
        lastProgressAt = Date.now();
      }
    }

    inFlightLocalId = null;

    // Events queued while this drain was running were never in its
    // snapshot, so they wait for the next trigger. Counted here to show
    // how often that happens.
    let addedDuringDrain = null;
    try {
      const row = await sqlite.getFirstAsync(
        "SELECT COUNT(*) as c FROM event_queue WHERE syncStatus IN ('pending','failed') AND createdAt >= ?",
        [drainStartAt]
      );
      addedDuringDrain = row ? row.c : 0;
    } catch {
      // measurement only
    }

    const drainSummary = {
      trigger,
      startCount: pending.length,
      syncedCount,
      failedCount,
      deadCount,
      addedDuringDrain,
      slowCount,
      drainMs: Date.now() - drainStartAt,
    };
    console.log("[sync-timing] drain", JSON.stringify(drainSummary));
    // At most one Sentry event per drain, carrying the slowest item.
    if (slowest) {
      Sentry.captureMessage("queueSync:slow", {
        level: "warning",
        tags: { area: "queueSync", trigger, hasPhoto: slowest.photoBytes != null ? "true" : "false" },
        contexts: { drainSummary, slowestItem: slowest },
      });
    }
    Sentry.addBreadcrumb({
      category: "queueSync",
      message: "drainQueue:finished",
      level: "info",
      data: { companyId, ...drainSummary },
    });

    // Records that a drain pass ran to completion (online, reached
    // Firestore) - independent of whether every individual item
    // succeeded; per-item failures stay visible in the Sync Queue tab
    // itself. Drives Settings' "last successful sync" display.
    if (myEpoch === currentEpoch) {
      await runExclusive(() =>
        sqlite.runAsync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('queueLastSync', ?)", [String(Date.now())])
      ).catch(() => {});
      notifyQueueChange();
    }
  } finally {
    clearInterval(stallCheck);
    // Only release the lock if this is still the drain currentEpoch
    // recognizes. If the stall detector already abandoned this epoch,
    // the lock state is already whatever it set - this drain releasing
    // it again (or stomping on a newer drain's lock) would reintroduce
    // the exact two-drains-at-once bug the epoch check exists to stop.
    if (myEpoch === currentEpoch) {
      syncing = false;
      notifyQueueChange();
    }
  }
}

export async function resetStuckSyncs() {
  const sqlite = await getDb();
  await runExclusive(() =>
    sqlite.runAsync("UPDATE event_queue SET syncStatus = 'pending' WHERE syncStatus = 'syncing'")
  );
  notifyQueueChange();
}

// Manual recovery for a 'dead' item from the Sync Queue tab - clears the
// attempt count and lastError and puts it back in line for the next
// drain. Never used automatically; dead-lettering only happens from
// exhausted automatic retries or a validation failure, so un-dead-
// lettering is a human decision. Does not touch `backedUp` - the raw
// data hasn't changed, so the existing backup is still accurate.
export async function retryQueueItem(localId) {
  const sqlite = await getDb();
  await runExclusive(() =>
    sqlite.runAsync(
      "UPDATE event_queue SET syncStatus = 'pending', attempts = 0, lastError = NULL WHERE localId = ?",
      [localId]
    )
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
