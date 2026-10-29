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

// The running drain, or null. Only one drain runs at a time, but it is
// no longer a "busy, come back later" lock: a drainQueue call that
// arrives while one is running wakes it (see wakePump) so a just-queued
// event is picked up right away instead of waiting for the next trigger.
let pump = null;

// Bumped every time a drain starts, and again whenever the stall
// detector below forcibly abandons one. A drain captures its own value
// at start (myEpoch) and checks it at every checkpoint. If they no
// longer match, this drain has been abandoned and must stop touching
// anything immediately: no more SQLite writes, no clobbering a row a
// newer drain may have already finished.
let currentEpoch = 0;

// Per-event in-flight lock: localIds currently being sent. A row in here
// is never picked up a second time, by this drain or a newer one.
const inFlight = new Set();

// Lets the Sync Queue tab show a live "syncing" state without polling -
// it just reads this alongside its own notifyQueueChange-driven refresh.
export function isQueueSyncing() {
  return pump !== null;
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

// How many employees' events are sent at the same time. Each employee's
// own events are always sent one at a time, oldest first.
const MAX_PARALLEL_EMPLOYEES = 3;

// How many photo uploads run at the same time. Separate from the doc
// lanes above, so a slow upload never holds up the next event's doc.
const MAX_PARALLEL_PHOTOS = 3;

// The photo step's own dead-letter limit. Higher than the doc's: by the
// time a row is here its event is already safe on the server, and a slow
// job-site uplink can fail an upload many times before one gets through.
// With the backoff below that is well over an hour of retrying.
const PHOTO_DEAD_LETTER_ATTEMPTS = 20;

// Wait before an automatic retry of a failed row, by attempt number
// (1st failure -> 5s, 2nd -> 15s, ... capped at 5 min). Stops a row that
// keeps failing from being retried in a tight loop on a bad network.
const RETRY_BACKOFF_MS = [5000, 15000, 30000, 60000, 120000, 300000];
function backoffMs(attempts) {
  return RETRY_BACKOFF_MS[Math.min(Math.max(attempts, 1), RETRY_BACKOFF_MS.length) - 1];
}

// Triggers that mean "conditions may have just changed" (network back,
// app reopened, someone pressed Sync Now). These clear the backoff so
// failed rows are retried right away instead of waiting out their timer.
const BACKOFF_RESET_TRIGGERS = new Set(["login", "foreground", "netChange", "syncNow", "retry", "pullRefresh"]);

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
//
// The object is named after the event's localId, so a retry overwrites
// the same file instead of leaving an orphaned copy behind.
async function uploadPhoto(companyId, employeeId, localId, localUri, timing) {
  // Dev-only: simulate the local-read step hanging - see
  // DevSyncFaultPanel.js's hangPhotoBlob switch.
  if (__DEV__ && isFaultActive("hangPhotoBlob")) {
    await withTimeout(hangForever(), resolveTimeoutMs(PHOTO_BLOB_TIMEOUT_MS), "photoBlob");
  }

  const filename = `${localId}.jpg`;
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

// Doc first, photo after (sync speed step 3). An event with a photo is
// sent in two steps so the clock event reaches the server in about a
// second, whatever the photo upload speed:
//
//   1. sendDoc   - writes the event doc with photoPending: true and NO
//                  photoUrl key. Local row -> 'photoPending', docSentAt set.
//   2. sendPhoto - uploads to .../{localId}.jpg, then merges
//                  { photoUrl, photoPending: false } into the doc.
//                  Local row -> 'synced'. The server's update trigger runs
//                  the face check once photoUrl appears.
//
// The doc write never includes photoUrl, not even as null, so no retry of
// step 1 can ever wipe a photo step 2 already attached. Step 1 is never
// re-run once docSentAt is set: retries of a 'photoPending' row only
// redo step 2, which is idempotent (same object path, same merge).
//
// Writes use the queue item's own localId as the Firestore document ID
// (setDoc, not addDoc) so this is safe to run twice: a replay after a
// crash or timeout overwrites the identical document instead of creating
// a second clock event for the same action.
function buildEventPayload(item, photoState) {
  return {
    localId: item.localId,
    employeeId: item.employeeId,
    employeeName: item.employeeName,
    siteId: item.siteId ?? null,
    siteName: item.siteName ?? "Not specified",
    subcontractorId: item.subcontractorId ?? null,
    subcontractorName: item.subcontractorName ?? null,
    type: item.type,
    source: item.source ?? null,
    // photoPending: the photo is still on its way (step 2 above).
    // photoMissing: this event was taken with a photo, but the file was
    // gone from the phone before it could be uploaded - shown on the web
    // instead of silently looking like an event that never had one.
    ...photoState,
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
}

// Firestore write with the dev fault switches and the timeout. merge:
// true, not a plain overwrite: onClockEventCreated adds fields this
// payload never includes (geofenceStatus, siteAutoDetected, faceCheck,
// etc. - see firestore.rules' clockEvents update denylist). A plain
// setDoc REPLACES the whole document, which would DELETE those
// server-added fields on any later write to this same id - and rules
// treat a removed field as an "affected key", so that alone would get
// rejected with permission-denied. With merge: true a retry only touches
// the fields it sends, so isIdempotentReplay's identity check decides it.
async function writeEventDoc(eventRef, data, timing, timingKey) {
  let writePromise;
  if (__DEV__ && isFaultActive("hangSetDoc")) {
    writePromise = hangForever();
  } else if (__DEV__ && isFaultActive("failSetDoc")) {
    writePromise = Promise.reject(fakePermissionDeniedError());
  } else {
    writePromise = setDoc(eventRef, data, { merge: true });
  }
  const start = Date.now();
  try {
    await withTimeout(writePromise, resolveTimeoutMs(FIRESTORE_WRITE_TIMEOUT_MS), "setDoc");
  } finally {
    timing[timingKey] = Date.now() - start;
  }
}

// After a permission-denied: does a doc with this item's identity already
// exist? If so a prior attempt's write really landed and this counts as
// sent, never Stuck. Only trusts a doc whose core identity fields match.
async function findLandedDoc(eventRef, item) {
  try {
    const snap = await getDoc(eventRef);
    const existing = snap.exists() ? snap.data() : null;
    if (
      existing &&
      existing.localId === item.localId &&
      existing.employeeId === item.employeeId &&
      existing.type === item.type &&
      existing.createdByUid === item.createdByUid
    ) {
      return existing;
    }
  } catch {
    // Re-read itself failed - fall through to normal failure handling.
  }
  return null;
}

// Step 1. Returns once the event doc is on the server.
async function sendDoc(sqlite, item, companyId, timing) {
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
      step: "doc",
    },
  });

  // Only a local file check here (no network) - decides whether the doc
  // says "photo on its way" or "photo missing". A positive, completed stat
  // result (file missing, or 0 bytes) is the ONLY thing that marks the
  // photo missing. A stat call that itself throws/times out is not proof
  // the file is bad - it fails the whole item instead, so it's retried
  // later with the photo still attached.
  let resolvedPhoto = null;
  let photoState = {};
  if (item.photoLocalUri) {
    const statStart = Date.now();
    resolvedPhoto = await resolvePhotoUri(item.photoLocalUri);
    timing.photoStatMs = Date.now() - statStart;
    if (resolvedPhoto) {
      timing.photoBytes = resolvedPhoto.info.size;
      photoState = { photoPending: true };
    } else {
      photoState = { photoMissing: true };
      Sentry.captureMessage("queueSync:photoDropped", {
        level: "warning",
        tags: { area: "queueSync", localId: item.localId, reason: "missing-or-empty", step: "doc" },
        contexts: { photo: { storedUri: item.photoLocalUri } },
      });
    }
  }

  const payload = buildEventPayload(item, photoState);
  try {
    await writeEventDoc(eventRef, payload, timing, "writeMs");
  } catch (err) {
    if (err && err.code === "permission-denied" && (await findLandedDoc(eventRef, item))) {
      Sentry.addBreadcrumb({ category: "queueSync", message: "syncOne:alreadyLanded", level: "info", data: { localId: item.localId } });
      timing.alreadyLanded = true;
    } else {
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
  }
  timing.tapToServerMs = Date.now() - item.createdAt;

  Sentry.addBreadcrumb({ category: "queueSync", message: "syncOne:firestoreWritten", level: "info", data: { localId: item.localId } });

  if (resolvedPhoto) {
    // Doc is on the server; the photo goes next. attempts restarts so the
    // photo step gets its own retry budget.
    await runExclusive(() =>
      sqlite.runAsync(
        "UPDATE event_queue SET syncStatus = 'photoPending', docSentAt = ?, photoLocalUri = ?, attempts = 0, lastError = NULL, nextAttemptAt = NULL WHERE localId = ?",
        [Date.now(), resolvedPhoto.uri, item.localId]
      )
    );
    notifyQueueChange();
    return "photoPending";
  }
  await finalizeSynced(sqlite, item, null);
  return "synced";
}

// Step 2. Uploads the photo and attaches it to the already-written doc.
async function sendPhoto(sqlite, item, companyId, timing) {
  const eventRef = doc(firestoreDb, "companies", companyId, "clockEvents", item.localId);

  Sentry.addBreadcrumb({
    category: "queueSync",
    message: "syncOne:start",
    level: "info",
    data: { localId: item.localId, attempts: item.attempts, step: "photo" },
  });

  const statStart = Date.now();
  const resolvedPhoto = await resolvePhotoUri(item.photoLocalUri);
  timing.photoStatMs = Date.now() - statStart;

  if (!resolvedPhoto) {
    // The file is gone. Either an earlier attempt already finished (it
    // deletes the file on success, and a timed-out attempt can still
    // finish in the background) - or it was really lost. Check the server
    // before deciding, so a finished upload is never marked missing.
    const existing = await findLandedDoc(eventRef, item);
    if (existing && existing.photoUrl) {
      timing.alreadyLanded = true;
      await finalizeSynced(sqlite, item, null);
      return "synced";
    }
    Sentry.captureMessage("queueSync:photoDropped", {
      level: "warning",
      tags: { area: "queueSync", localId: item.localId, reason: "missing-or-empty", step: "photo" },
      contexts: { photo: { storedUri: item.photoLocalUri } },
    });
    await writeEventDoc(eventRef, { photoPending: false, photoMissing: true }, timing, "photoWriteMs");
    await finalizeSynced(sqlite, item, null);
    return "synced";
  }

  timing.photoBytes = resolvedPhoto.info.size;
  // Any failure from here on (network, upload, timeout) is ambiguous -
  // not proof the file is bad - so it fails this step normally, keeping
  // the file for the next retry.
  const photoUrl = await uploadPhoto(companyId, item.employeeId, item.localId, resolvedPhoto.uri, timing);
  Sentry.addBreadcrumb({ category: "queueSync", message: "syncOne:photoUploaded", level: "info", data: { localId: item.localId } });

  // Only these two keys: the identity fields already on the doc are left
  // alone, so isIdempotentReplay still holds for this update.
  await writeEventDoc(eventRef, { photoUrl, photoPending: false }, timing, "photoWriteMs");
  timing.tapToPhotoMs = Date.now() - item.createdAt;

  await finalizeSynced(sqlite, item, resolvedPhoto);
  return "synced";
}

// Shared tail for every way a row finishes - marks it synced and
// best-effort cleans up its local photo.
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
      "UPDATE event_queue SET syncStatus = 'synced', syncedAt = ?, nextAttemptAt = NULL WHERE localId = ?",
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

// Reads every row that is ready to send - the event doc ('pending'/
// 'failed') or just its photo ('photoPending') - past its retry backoff
// and not already being sent. If the batch query itself throws
// (goal 12 - a single unreadable row can poison a SELECT * on some SQLite
// driver paths), falls back to reading just the id column, then
// hydrating each row one at a time so a single corrupted row can be
// skipped-and-logged instead of blocking every other item's read.
const READY_WHERE =
  "syncStatus IN ('pending','failed','photoPending') AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?)";

async function readPendingItems(sqlite) {
  const now = Date.now();
  let rows;
  try {
    rows = await sqlite.getAllAsync(
      `SELECT * FROM event_queue WHERE ${READY_WHERE} ORDER BY clientTimestamp ASC`,
      [now]
    );
  } catch (batchErr) {
    Sentry.captureException(batchErr, { tags: { area: "queueSync", step: "batchRead" } });

    let ids = [];
    try {
      ids = await sqlite.getAllAsync(
        `SELECT localId FROM event_queue WHERE ${READY_WHERE} ORDER BY clientTimestamp ASC`,
        [now]
      );
    } catch (idsErr) {
      Sentry.captureException(idsErr, { tags: { area: "queueSync", step: "batchReadFallbackIds" } });
      return [];
    }

    rows = [];
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
  }
  return rows.filter((r) => !inFlight.has(r.localId));
}

// One automatic retry timer for the soonest backed-off row, so a failed
// row is retried when its backoff ends even if no other trigger fires
// (useQueueSync's 60s poll is still there as a backstop).
let retryTimer = null;
async function scheduleBackoffRetry(sqlite, companyId) {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  try {
    const row = await sqlite.getFirstAsync(
      "SELECT MIN(nextAttemptAt) as t FROM event_queue WHERE syncStatus IN ('pending','failed','photoPending') AND nextAttemptAt IS NOT NULL"
    );
    if (!row || row.t == null) return;
    const delay = Math.max(1000, row.t - Date.now());
    retryTimer = setTimeout(() => {
      retryTimer = null;
      drainQueue(companyId, "backoff");
    }, delay);
  } catch {
    // The 60s poll in useQueueSync still covers this.
  }
}

async function clearBackoff() {
  const sqlite = await getDb();
  await runExclusive(() =>
    sqlite.runAsync(
      "UPDATE event_queue SET nextAttemptAt = NULL WHERE syncStatus IN ('pending','failed','photoPending') AND nextAttemptAt IS NOT NULL"
    )
  );
}

// Sends one row - its event doc, or (for a 'photoPending' row) just its
// photo - then records the outcome. Never throws.
// The backup copy (queueBackups) runs alongside, not before, the real
// send - it's a safety net and must not add a round trip to every event.
// The one exception is a structurally invalid row: it never reaches
// clockEvents, so its backup is awaited because it's the only copy.
async function processItem(state, sqlite, companyId, item) {
  const { myEpoch, trigger, stats } = state;
  const isPhotoStep = item.syncStatus === "photoPending";
  inFlight.add(item.localId);
  try {
    await runExclusive(() =>
      sqlite.runAsync("UPDATE event_queue SET syncStatus = 'syncing' WHERE localId = ?", [item.localId])
    );
    notifyQueueChange();

    const timing = {
      step: isPhotoStep ? "photo" : "doc",
      queueWaitMs: Date.now() - item.createdAt,
      drainAgeMs: Date.now() - state.startedAt,
    };

    try {
      let outcome;
      if (isPhotoStep) {
        outcome = await withTimeout(sendPhoto(sqlite, item, companyId, timing), resolveTimeoutMs(PER_ITEM_TIMEOUT_MS), "item");
      } else {
        const validationError = validateQueueItem(item);
        if (validationError) {
          await backupItemIfNeeded(sqlite, companyId, item);
          const err = new Error(`invalid:${validationError}`);
          err.code = "queue-validation";
          throw err;
        }
        const backup = backupItemIfNeeded(sqlite, companyId, item);
        outcome = await withTimeout(sendDoc(sqlite, item, companyId, timing), resolveTimeoutMs(PER_ITEM_TIMEOUT_MS), "item");
        backup.catch(() => {});
      }

      if (myEpoch !== currentEpoch) return;
      state.lastProgressAt = Date.now();
      if (isPhotoStep) {
        stats.photoCount++;
        logSyncTiming(item, timing, "photoSent", trigger);
      } else {
        stats.syncedCount++;
        const logged = logSyncTiming(item, timing, outcome === "photoPending" ? "docSent" : "synced", trigger);
        // Start this event's photo upload now, not when the lane ends.
        if (outcome === "photoPending") wakePump(state);
        if (timing.tapToServerMs > SLOW_SYNC_REPORT_MS) {
          stats.slowCount++;
          if (!stats.slowest || timing.tapToServerMs > stats.slowest.tapToServerMs) stats.slowest = logged;
        }
      }
    } catch (err) {
      if (myEpoch !== currentEpoch) return;

      logSyncTiming(item, { ...timing, error: err.message }, "failed", trigger);
      console.log("Sync failed for", item.localId, timing.step, err.message);
      stats.failedCount++;

      const isValidationFailure = err.code === "queue-validation";
      const nextAttempts = (item.attempts || 0) + 1;
      const isDead =
        isValidationFailure || nextAttempts >= (isPhotoStep ? PHOTO_DEAD_LETTER_ATTEMPTS : DEAD_LETTER_ATTEMPTS);
      if (isDead) stats.deadCount++;

      // A persistent failure (attempts keeps climbing) means this item
      // will never sync on its own - e.g. a Firestore rules rejection,
      // a malformed field, or a step that keeps timing out - as opposed
      // to a one-off network blip. Report every failure so Sentry's
      // grouping/count shows which this is; tag by attempts bucket and
      // dead-letter state so a chronically-stuck item stands out.
      Sentry.captureException(err, {
        tags: {
          area: "queueSync",
          eventType: item.type,
          source: item.source ?? "unknown",
          persistent: item.attempts >= 2 ? "true" : "false",
          deadLetter: isDead ? "true" : "false",
          invalid: isValidationFailure ? "true" : "false",
          timedOut: typeof err.message === "string" && err.message.startsWith("timeout:") ? "true" : "false",
          step: timing.step,
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
          "UPDATE event_queue SET syncStatus = ?, attempts = ?, lastError = ?, nextAttemptAt = ? WHERE localId = ?",
          [
            // A failed photo step stays 'photoPending': its doc is already
            // on the server, so only the photo is retried.
            isDead ? "dead" : isPhotoStep ? "photoPending" : "failed",
            nextAttempts,
            err.message || "Unknown error",
            isDead ? null : Date.now() + backoffMs(nextAttempts),
            item.localId,
          ]
        )
      );
      notifyQueueChange();
      state.lastProgressAt = Date.now();
    }
  } catch (err) {
    // Only the SQLite status writes above can land here. The row stays
    // 'syncing' and resetStuckSyncs puts it back in line.
    Sentry.captureException(err, { tags: { area: "queueSync", step: "statusWrite" } });
  } finally {
    inFlight.delete(item.localId);
  }
}

// One employee's events, strictly one at a time, oldest first. A failed
// event does not block the next one (same as before this change); it
// waits out its backoff and is retried by a later pass.
async function runEmployeeLane(state, sqlite, companyId, items) {
  for (const item of items) {
    if (state.myEpoch !== currentEpoch) return;
    if (inFlight.has(item.localId)) continue;
    await processItem(state, sqlite, companyId, item);
  }
}

function wakePump(p) {
  p.wakeRequested = true;
  if (p.wake) {
    const resolve = p.wake;
    p.wake = null;
    resolve();
  }
}

// `trigger` names which caller started this drain (measurement, plus
// whether to clear retry backoff - see BACKOFF_RESET_TRIGGERS).
export async function drainQueue(companyId, trigger = "other") {
  if (!companyId) return;

  if (BACKOFF_RESET_TRIGGERS.has(trigger)) {
    await clearBackoff().catch(() => {});
  }

  if (pump) {
    if (!pump.closing) {
      // A drain is already running: wake it so it re-reads the queue and
      // starts on this new work now (if it has a free slot), instead of
      // the old behavior of skipping and waiting for the next trigger.
      Sentry.addBreadcrumb({ category: "queueSync", message: "drainQueue:woke-running", level: "info", data: { trigger } });
      wakePump(pump);
      return pump.promise;
    }
    // The running drain has already finished its last read - run again
    // right after it so this call's work is not missed.
    const closing = pump.promise;
    return closing.then(() => drainQueue(companyId, trigger));
  }

  // isConnected only means "attached to a network interface," not "that
  // network can actually reach the internet". isInternetReachable is
  // NetInfo's reachability probe; treat only a confirmed-false as a
  // reason to skip (null/undefined means "still checking," and we'd
  // rather attempt and let the per-step timeouts catch a bad network).
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
  // Re-check: another call may have started a drain during the await.
  if (pump) return drainQueue(companyId, trigger);

  const p = {
    myEpoch: ++currentEpoch,
    trigger,
    startedAt: Date.now(),
    lastProgressAt: Date.now(),
    wakeRequested: false,
    wake: null,
    closing: false,
    stats: { syncedCount: 0, photoCount: 0, failedCount: 0, deadCount: 0, slowCount: 0, slowest: null },
    promise: null,
  };
  pump = p;
  p.promise = runPump(p, companyId).catch((err) => {
    Sentry.captureException(err, { tags: { area: "queueSync", step: "drain" } });
  });
  notifyQueueChange();
  return p.promise;
}

async function runPump(p, companyId) {
  const { myEpoch, trigger, stats } = p;
  const lanes = new Map(); // employeeId -> promise (event docs)
  const photos = new Map(); // localId -> promise (photo uploads)
  const seen = new Set(); // localIds picked up by this drain (summary only)
  let addedDuringDrain = 0;

  // The lock must never be held forever. This fires only when NOTHING
  // has finished - success or failure - in STALL_THRESHOLD_MS, i.e. truly
  // stuck, not just long. It can't cancel work in flight; it bumps
  // currentEpoch so this drain stops writing anything, releases the
  // lock, and clears the in-flight set so a fresh drain can retry those
  // rows (a retry is safe: same doc id, merge write).
  const stallCheck = setInterval(() => {
    if (myEpoch !== currentEpoch) {
      clearInterval(stallCheck);
      return;
    }
    if (Date.now() - p.lastProgressAt > resolveTimeoutMs(STALL_THRESHOLD_MS)) {
      Sentry.captureMessage("queueSync:stall-forced-unlock", {
        level: "warning",
        tags: { area: "queueSync" },
        contexts: {
          queueSync: { companyId, inFlight: [...inFlight], stallThresholdMs: resolveTimeoutMs(STALL_THRESHOLD_MS) },
        },
      });
      currentEpoch++;
      inFlight.clear();
      if (pump === p) pump = null;
      notifyQueueChange();
      clearInterval(stallCheck);
      wakePump(p);
    }
  }, resolveTimeoutMs(STALL_CHECK_INTERVAL_MS));

  let sqlite = null;
  try {
    // Dev-only: hang before any item is even picked up, bypassing every
    // per-item timeout. Exercises the stall detector as a last resort.
    if (__DEV__ && isFaultActive("hangWholeDrain")) {
      await hangForever();
    }

    await cleanupSyncedQueueItems().catch(() => {});
    sqlite = await getDb();

    const markSeen = (item) => {
      if (!seen.has(item.localId)) {
        seen.add(item.localId);
        if (item.createdAt >= p.startedAt) addedDuringDrain++;
      }
    };

    // Keep starting work until there is nothing left that's ready.
    // Re-reads the queue every time a task finishes or a new drainQueue
    // call wakes us, so events queued mid-drain are picked up right away -
    // including a photo whose doc was just sent.
    while (myEpoch === currentEpoch) {
      p.wakeRequested = false;
      const ready = await readPendingItems(sqlite);

      // Event docs: one lane per employee, in order.
      const byEmployee = new Map();
      for (const item of ready) {
        if (item.syncStatus === "photoPending") continue;
        if (!byEmployee.has(item.employeeId)) byEmployee.set(item.employeeId, []);
        byEmployee.get(item.employeeId).push(item);
      }
      for (const [employeeId, items] of byEmployee) {
        if (lanes.size >= MAX_PARALLEL_EMPLOYEES) break;
        if (lanes.has(employeeId)) continue;
        items.forEach(markSeen);
        const lane = runEmployeeLane(p, sqlite, companyId, items).finally(() => {
          lanes.delete(employeeId);
        });
        lanes.set(employeeId, lane);
      }

      // Photos: oldest first, their own slots.
      for (const item of ready) {
        if (item.syncStatus !== "photoPending") continue;
        if (photos.size >= MAX_PARALLEL_PHOTOS) break;
        if (photos.has(item.localId)) continue;
        markSeen(item);
        const task = processItem(p, sqlite, companyId, item).finally(() => {
          photos.delete(item.localId);
        });
        photos.set(item.localId, task);
      }

      if (lanes.size === 0 && photos.size === 0) {
        if (p.wakeRequested) continue;
        break;
      }
      const woken = new Promise((resolve) => {
        p.wake = resolve;
      });
      await Promise.race([...lanes.values(), ...photos.values(), woken]);
      p.wake = null;
    }
    // From here on a new drainQueue call queues behind this one.
    p.closing = true;
    await Promise.all([...lanes.values(), ...photos.values()]);

    const drainSummary = {
      trigger,
      startCount: seen.size,
      syncedCount: stats.syncedCount,
      photoCount: stats.photoCount,
      failedCount: stats.failedCount,
      deadCount: stats.deadCount,
      addedDuringDrain,
      slowCount: stats.slowCount,
      drainMs: Date.now() - p.startedAt,
    };
    console.log("[sync-timing] drain", JSON.stringify(drainSummary));
    // At most one Sentry event per drain, carrying the slowest item.
    if (stats.slowest) {
      Sentry.captureMessage("queueSync:slow", {
        level: "warning",
        tags: { area: "queueSync", trigger, hasPhoto: stats.slowest.photoBytes != null ? "true" : "false" },
        contexts: { drainSummary, slowestItem: stats.slowest },
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
    // succeeded. Drives Settings' "last successful sync" display.
    if (myEpoch === currentEpoch) {
      await runExclusive(() =>
        sqlite.runAsync("INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('queueLastSync', ?)", [String(Date.now())])
      ).catch(() => {});
      await scheduleBackoffRetry(sqlite, companyId);
    }
  } finally {
    clearInterval(stallCheck);
    p.closing = true;
    // Only release the lock if the stall detector hasn't already.
    if (pump === p) {
      pump = null;
      notifyQueueChange();
    }
  }
}

// A row left 'syncing' goes back to whichever step it was on: its doc
// (pending) or, if the doc already reached the server, its photo.
export async function resetStuckSyncs() {
  const sqlite = await getDb();
  await runExclusive(() =>
    sqlite.runAsync(
      "UPDATE event_queue SET syncStatus = CASE WHEN docSentAt IS NOT NULL THEN 'photoPending' ELSE 'pending' END WHERE syncStatus = 'syncing'"
    )
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
      "UPDATE event_queue SET syncStatus = CASE WHEN docSentAt IS NOT NULL THEN 'photoPending' ELSE 'pending' END, attempts = 0, lastError = NULL, nextAttemptAt = NULL WHERE localId = ?",
      [localId]
    )
  );
  notifyQueueChange();
}

export async function getPendingCount() {
  const sqlite = await getDb();
  const row = await sqlite.getFirstAsync(
    "SELECT COUNT(*) as c FROM event_queue WHERE syncStatus IN ('pending','syncing','failed','photoPending')"
  );
  return row ? row.c : 0;
}

export async function getLastSyncTime() {
  const sqlite = await getDb();
  const row = await sqlite.getFirstAsync("SELECT value FROM sync_meta WHERE key = 'queueLastSync'");
  return row ? Number(row.value) : null;
}
