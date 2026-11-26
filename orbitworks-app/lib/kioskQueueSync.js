import { httpsCallable } from "firebase/functions";
import { ref } from "firebase/storage";
import { functions, storage } from "./firebase";
import { uploadLocalFileToStorage } from "./storageUpload";
import { photoPathFor } from "./employeeHome";
import { APP_RUN_ID, uptimeNow, withAnchor } from "./clockAnchor";
import { fastWaitMs, withTimeout } from "./punchQueueLogic";
import { isAlreadyUploaded, kioskCommentFor, kioskFailKind } from "./kioskLogic";
import { getOrCreateDeviceId } from "./deviceId";
import {
  cleanupKioskQueue,
  getKioskPin,
  listKioskPunches,
  markKioskFailed,
  markKioskPhotoUploaded,
  markKioskSynced,
  markKioskSyncing,
  markKioskWaiting,
} from "./kioskQueue";

// Task 5 Kiosk mode - sends this kiosk login's saved punches, oldest first,
// one at a time (same order rules as the Employee App's punchQueueSync).
// Per punch: upload the photo (clock in/out) -> kioskPunch with queuedAtMs
// (+ waitMs when it's a fast send in the same app run, so it gets server
// time like an online punch), lastServerMs and the location. Then:
//   accepted                -> synced (PIN + local photo deleted)
//   signal / server trouble -> back to waiting, stop; tried again later
//   kiosk locked (server)   -> back to waiting, stop
//   refused for good        -> failed (shown in Kiosk Settings), go on
// A resend is safe: requestId is the event id, the server returns the first
// result. A queued punch is never refused for its age or for not fitting
// the current status (the server places it at its own time and flags it).

const punchFn = httpsCallable(functions, "kioskPunch", { timeout: 30000 });
const UPLOAD_TIMEOUT_MS = 30000;
const SEND_TIMEOUT_MS = 30000;
const MAX_PER_RUN = 100;

let running = null;
let again = false;

// What the tablet shows for a punch the server refused for good.
function refusedText(err) {
  const reason = err && err.details && err.details.reason;
  if (reason === "wrongPin") return "PIN changed before this punch was sent. Tell your admin.";
  if (reason === "inactive") return "This employee is inactive.";
  if (reason === "notPro") return "Kiosk needs Pro - ask your admin";
  return (err && err.message) || "Not recorded. Tell your admin.";
}

async function sendOne(item, deviceId) {
  const pin = await getKioskPin(item.requestId);
  if (!pin) {
    await markKioskFailed(item, "Not recorded (the PIN was lost on this iPad). Tell your admin.");
    return "failed";
  }
  await markKioskSyncing(item.requestId);
  const isInOut = item.action === "in" || item.action === "out";
  const data = {
    action: item.action,
    requestId: item.requestId,
    employeeId: item.employeeId,
    pin,
    queuedAtMs: Math.round(item.queuedAtMs),
  };
  if (deviceId) data.deviceId = deviceId;
  if (Number.isFinite(item.lastServerMs) && item.lastServerMs > 0) data.lastServerMs = Math.round(item.lastServerMs);
  if (Number.isFinite(item.expectedAtMs)) data.expectedAtMs = Math.round(item.expectedAtMs);
  if (item.location !== undefined) data.location = item.location;
  const comment = kioskCommentFor(item.action, item.employeeComment);
  if (comment) data.employeeComment = comment;
  try {
    if (isInOut) {
      if (item.photoLocalUri && !item.photoUploaded) {
        const path = photoPathFor(item.companyId, item.employeeId, item.requestId);
        try {
          await withTimeout(uploadLocalFileToStorage(ref(storage, path), item.photoLocalUri, "image/jpeg", { foreground: true }), UPLOAD_TIMEOUT_MS);
        } catch (err) {
          // Already there from an earlier try (storage.rules: a kiosk only
          // writes where no file exists) - the server checks the file.
          if (!isAlreadyUploaded(err)) throw err;
        }
        await markKioskPhotoUploaded(item.requestId);
      }
      if (item.photoLocalUri || item.photoUploaded) data.photoPath = photoPathFor(item.companyId, item.employeeId, item.requestId);
      else data.photoMissing = true;
    }
    const waitMs = fastWaitMs(item, { sessionId: APP_RUN_ID, uptimeNowMs: await uptimeNow(), wallNowMs: Date.now() });
    if (waitMs !== null) data.waitMs = waitMs;
    await withTimeout(withAnchor(() => punchFn(data)), SEND_TIMEOUT_MS);
    await markKioskSynced(item);
    return "synced";
  } catch (err) {
    const kind = kioskFailKind(err);
    if (kind === "failed") {
      await markKioskFailed(item, refusedText(err));
      return "failed";
    }
    await markKioskWaiting(item.requestId);
    return "stop";
  }
}

// Sends what's waiting. Calls while one runs make it go round once more.
export function syncKioskQueue(kioskUid) {
  if (!kioskUid) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const deviceId = await getOrCreateDeviceId().catch(() => null);
        let sent = 0;
        for (;;) {
          const items = await listKioskPunches(kioskUid);
          // A "syncing" row left by a killed app is sent again (safe: requestId).
          const next = items.find((i) => i.status === "waiting" || i.status === "syncing");
          if (!next || sent >= MAX_PER_RUN) break;
          const outcome = await sendOne(next, deviceId);
          sent++;
          if (outcome === "stop") return;
        }
      } while (again);
      await cleanupKioskQueue().catch(() => {});
    } finally {
      running = null;
    }
  })();
  return running;
}
