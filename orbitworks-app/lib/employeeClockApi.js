import * as Crypto from "expo-crypto";
import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";
import { ref } from "firebase/storage";
import { functions, storage } from "./firebase";
import { uploadLocalFileToStorage } from "./storageUpload";
import { photoPathFor } from "./employeeHome";

// Employee App: calls to the server for clock in/out/breaks and the Home
// site. Online only in this phase (offline punches are Phase 4). The PIN is
// sent once per punch over TLS and never stored or logged on the phone.

const punchFn = httpsCallable(functions, "employeeClockPunch", { timeout: 30000 });
const homeSiteFn = httpsCallable(functions, "getEmployeeHomeSite", { timeout: 15000 });

// One id per punch attempt. Reused for retries of the same punch, so a reply
// lost to bad signal can never create a second event.
export function newRequestId() {
  return Crypto.randomUUID();
}

export async function isOnline() {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected !== false;
  } catch {
    return true;
  }
}

// Uploads the live clock photo to the punch's own path (the only name the
// server accepts for this requestId) and returns that path. Foreground
// upload: the employee is waiting on screen (see storageUpload.js).
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
export async function sendPunch({ action, requestId, pin, photoPath }) {
  const data = { action, requestId };
  if (pin) data.pin = pin;
  if (photoPath) data.photoPath = photoPath;
  const res = await punchFn(data);
  return res.data;
}

// -> { siteId, siteName } or null on any failure (Home then shows blank).
export async function fetchHomeSite() {
  try {
    const res = await homeSiteFn({});
    return res.data;
  } catch {
    return null;
  }
}
