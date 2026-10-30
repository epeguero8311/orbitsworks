import * as Crypto from "expo-crypto";
import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";
import { ref } from "firebase/storage";
import { functions, storage } from "./firebase";
import { uploadLocalFileToStorage } from "./storageUpload";
import { photoPathFor } from "./employeeHome";
import { PIN_CHECK_TIMEOUT_MS, PUNCH_TIMEOUT_MS, withTimeout } from "./punchQueueLogic";

// Employee App: calls to the server for clock in/out/breaks and the Home
// site. The PIN is sent over TLS with the punch. A punch that can't go
// through quickly is saved on the phone instead (lib/punchQueue.js) - its
// PIN is kept in SecureStore only until it syncs (24 h at most) and is
// never logged.
//
// Time limits for a punch made on screen (Phase 4):
//   3 s for the PIN check  - then the PIN is saved and the camera opens
//   5 s for upload + punch - then the punch is saved and sent later
// The queue's own sends (punchQueueSync.js) use the callable's 30 s.

const punchFn = httpsCallable(functions, "employeeClockPunch", { timeout: 30000 });
const homeSiteFn = httpsCallable(functions, "getEmployeeHomeSite", { timeout: 15000 });

export { PIN_CHECK_TIMEOUT_MS, PUNCH_TIMEOUT_MS, withTimeout };

// One id per punch attempt. Reused for retries of the same punch, so a reply
// lost to bad signal can never create a second event.
export function newRequestId() {
  return Crypto.randomUUID();
}

// false only when the phone knows it has no connection (no network, or
// wifi with no internet behind it). Unknown counts as online.
export async function isOnline() {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

// Uploads the live clock photo to the punch's own path (the only name the
// server accepts for this requestId) and returns that path. Foreground
// upload: the employee or the queue is waiting on it (see storageUpload.js).
export async function uploadClockPhoto({ companyId, employeeId, requestId, localUri }) {
  const path = photoPathFor(companyId, employeeId, requestId);
  await uploadLocalFileToStorage(ref(storage, path), localUri, "image/jpeg", { foreground: true });
  return path;
}

// Clock in/out: the server checks the PIN before the camera opens (same
// wrong-PIN count and lock as the punch). Resolves { pinOk: true }; a wrong
// PIN, the lock or an inactive account reject like a punch would. Nothing
// is written - the punch itself checks the PIN again.
export async function checkPin({ action, requestId, pin }) {
  const res = await punchFn({ action, requestId, pin, checkPinOnly: true });
  return res.data;
}

// -> EmployeeClockPunchResult (see the website's lib/types.ts).
// queuedAtMs: only for a punch sent from the phone's queue - when the
// employee made it.
export async function sendPunch({ action, requestId, pin, photoPath, queuedAtMs }) {
  const data = { action, requestId };
  if (pin) data.pin = pin;
  if (photoPath) data.photoPath = photoPath;
  if (typeof queuedAtMs === "number") data.queuedAtMs = Math.round(queuedAtMs);
  const res = await punchFn(data);
  return res.data;
}

// -> { siteId, siteName } or null on any failure (Home then shows the last
// one it knew).
export async function fetchHomeSite() {
  try {
    const res = await homeSiteFn({});
    return res.data;
  } catch {
    return null;
  }
}
