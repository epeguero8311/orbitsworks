import * as Crypto from "expo-crypto";
import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";
import { ref } from "firebase/storage";
import { functions, storage } from "./firebase";
import { uploadLocalFileToStorage } from "./storageUpload";
import { photoPathFor } from "./employeeHome";
import { withAnchor } from "./clockAnchor";

// Employee App: calls to the server for clock in/out/breaks and the Home
// site. The PIN is sent over TLS with the punch. Every punch is saved on
// the phone first (lib/punchQueue.js) and sent by the queue right away -
// its PIN is kept in SecureStore only until it syncs (24 h at most) and is
// never logged. The PIN is checked on the phone first (lib/pinCheck.js);
// the server checks it again when the punch arrives.
// The queue's sends (punchQueueSync.js) use the callable's 30 s.
// Every successful punch call saves server time + uptime (clockAnchor.js).

const punchFn = httpsCallable(functions, "employeeClockPunch", { timeout: 30000 });
const homeSiteFn = httpsCallable(functions, "getEmployeeHomeSite", { timeout: 15000 });


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

// -> EmployeeClockPunchResult (see the website's lib/types.ts).
// queuedAtMs: when the employee made the punch (phone time). waitMs: how
// long it waited, by uptime, when known (fast sync). expectedAtMs: when the
// phone expected it to be (phoneClockOff). See employeeClockQueued.ts.
export async function sendPunch({ action, requestId, pin, photoPath, queuedAtMs, waitMs, expectedAtMs, location }) {
  const data = { action, requestId };
  if (pin) data.pin = pin;
  if (photoPath) data.photoPath = photoPath;
  if (typeof queuedAtMs === "number") {
    data.queuedAtMs = Math.round(queuedAtMs);
    if (Number.isFinite(waitMs)) data.waitMs = Math.round(waitMs);
    if (Number.isFinite(expectedAtMs)) data.expectedAtMs = Math.round(expectedAtMs);
  }
  // Phase 6: null = no fix; undefined (a row saved before Phase 6) = no field.
  if (location !== undefined) data.location = location;
  const res = await withAnchor(() => punchFn(data));
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
