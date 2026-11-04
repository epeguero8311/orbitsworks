import { isOnline, sendPunch, uploadClockPhoto } from "./employeeClockApi";
import { photoPathFor } from "./employeeHome";
import {
  failKind,
  failMessage,
  fastWaitMs,
  isTooOld,
  NOT_RECORDED_MESSAGE,
  nextToSend,
  withTimeout,
} from "./punchQueueLogic";
import { APP_RUN_ID, uptimeNow } from "./clockAnchor";
import { outcomeOf, recordSyncTiming } from "./punchTimings";
import {
  cleanupPunchQueue,
  getSavedPin,
  listAllPunches,
  markFailed,
  markPhotoUploaded,
  markSynced,
  markSyncing,
  markWaiting,
  photoExists,
  setLastSynced,
} from "./punchQueue";
import { noteSignalOk, noteWeakSignal } from "./punchQueueEvents";
import { refreshPinVerifier } from "./pinCheck";
import { drainComments } from "./commentQueueSync";

// Employee App Phase 4 - sends the signed-in employee's saved punches,
// oldest first, one at a time. Another employee's punches on this phone are
// never sent (they wait until that employee signs back in).
//
// Every punch from the app comes through here (online ones too, a moment
// after the green screen). Per punch: upload the photo (clock in/out,
// unless already uploaded) -> employeeClockPunch with queuedAtMs, plus
// waitMs when the uptime wait is known (fast sync: server time) and
// expectedAtMs (phoneClockOff) - see clockAnchor.js. Then:
//   accepted          -> Synced (PIN + local photo deleted, Last synced)
//   signal / timeout  -> back to Waiting, stop; tried again later
//   failed for good   -> Failed (PIN deleted), stop: the queue pauses until
//                        the employee taps Remove on the Sync tab (Phase 5:
//                        no Redo - the server already takes the PIN that
//                        was right when the punch was made)
// A resend after a timeout is safe: the requestId is the event id, so the
// server returns the first result instead of writing a second event.

const UPLOAD_TIMEOUT_MS = 30000;
const SEND_TIMEOUT_MS = 30000;
// Safety stop for one run (a queue is a handful of punches).
const MAX_PER_RUN = 50;

let running = null;
let again = false;

export function isPunchSyncRunning() {
  return running !== null;
}

// Runs one sync for this employee. A call while one is running asks it to
// go round once more and returns the same promise.
export function syncPunchQueue(companyId, employeeId) {
  if (!companyId || !employeeId) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        // Phase 5: comments go right after the punches, in the same run.
        // Each side's problems stay its own: a paused or failing punch
        // queue never holds back comments, and comments never touch punches.
        try {
          await drain(companyId, employeeId);
        } finally {
          await drainComments(companyId, employeeId).catch(() => {});
        }
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function drain(companyId, employeeId) {
  await cleanupPunchQueue().catch(() => {});
  for (let i = 0; i < MAX_PER_RUN; i++) {
    const next = nextToSend(await listAllPunches(), companyId, employeeId);
    if (!next) return;
    if (!(await isOnline())) return;
    const sent = await sendOne(next);
    if (!sent) return;
  }
}

async function fail(item, kind, reason) {
  await markFailed(item.requestId, kind, reason, failMessage(kind));
  // Wrong PIN at sync = the PIN changed: get the new one, so new punches
  // are checked against it on the phone.
  if (reason === "wrongPin") refreshPinVerifier(item.companyId, item.employeeId).catch(() => {});
}

async function waitFor(item) {
  return fastWaitMs(item, { sessionId: APP_RUN_ID, uptimeNowMs: await uptimeNow(), wallNowMs: Date.now() });
}

// true = synced, false = stop this run (waiting again, or failed).
async function sendOne(item) {
  // A fast sync gets server time, so the phone's own time (maybe wrong)
  // can't make it "too old".
  if ((await waitFor(item)) === null && isTooOld(item, Date.now())) {
    await markFailed(item.requestId, "notRecorded", "tooOld", NOT_RECORDED_MESSAGE);
    return false;
  }
  await markSyncing(item.requestId);
  const isInOut = item.action === "in" || item.action === "out";
  const t0 = Date.now();
  let uploadMs = null;
  try {
    let pin;
    let photoPath;
    if (isInOut) {
      pin = await getSavedPin(item.requestId);
      if (!pin) {
        // The keychain lost it: the punch can't be sent (Phase 5, Q5 A).
        await fail(item, "couldntSync", "noPin");
        return false;
      }
      photoPath = photoPathFor(item.companyId, item.employeeId, item.requestId);
      if (!item.photoUploaded) {
        if (!(await photoExists(item.photoLocalUri))) {
          await fail(item, "notRecorded", "photo");
          return false;
        }
        await withTimeout(
          uploadClockPhoto({ companyId: item.companyId, employeeId: item.employeeId, requestId: item.requestId, localUri: item.photoLocalUri }),
          UPLOAD_TIMEOUT_MS
        );
        await markPhotoUploaded(item.requestId);
        uploadMs = Date.now() - t0;
      }
    }
    const t1 = Date.now();
    // Measured right before sending, after any upload.
    const waitMs = await waitFor(item);
    const res = await withTimeout(
      sendPunch({
        action: item.action,
        requestId: item.requestId,
        pin,
        photoPath,
        queuedAtMs: item.queuedAtMs,
        waitMs,
        expectedAtMs: item.expectedAtMs,
      }),
      SEND_TIMEOUT_MS
    );
    await markSynced(item.requestId, res && res.siteName);
    await setLastSynced(item.companyId, item.employeeId, Date.now());
    noteSignalOk();
    recordSyncTiming(item.action, waitMs === null ? "synced (queued)" : "synced", {
      uploadMs,
      punchMs: Date.now() - t1,
      totalMs: Date.now() - item.createdAt,
    }).catch(() => {});
    return true;
  } catch (err) {
    recordSyncTiming(item.action, `sync ${outcomeOf(err)}`, { uploadMs, totalMs: Date.now() - item.createdAt }).catch(() => {});
    const kind = failKind(err);
    if (kind === "retry") {
      if (err && err.code === "timeout") noteWeakSignal();
      await markWaiting(item.requestId);
      return false;
    }
    await fail(item, kind, err && err.details && err.details.reason);
    return false;
  }
}
