import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { toFence, toSiteExitPayload } from "./validators/siteExit";

// Employee App Phase 8 - the leave tracking and location consent calls
// (functions/src/employeeSiteExits.ts). The employee always comes from the
// login, never from what the phone sends.

const recordFn = httpsCallable(functions, "recordSiteExit", { timeout: 20000 });
const shiftFenceFn = httpsCallable(functions, "getShiftFence", { timeout: 15000 });
const consentFn = httpsCallable(functions, "getLocationConsent", { timeout: 15000 });
const acceptFn = httpsCallable(functions, "acceptLocationConsent", { timeout: 15000 });

// One queue row -> { ok, recorded, tracking, dropped? }. Throws on a
// network / server error (the queue tries again later).
export async function sendSiteExit(row) {
  const res = await recordFn(toSiteExitPayload(row));
  return res.data || {};
}

// -> { tracking, fence, siteName } or null when the server can't be asked.
export async function fetchShiftFence(clockInEventId) {
  try {
    const res = await shiftFenceFn({ clockInEventId });
    const data = res.data || {};
    return { tracking: data.tracking === true, fence: toFence(data.fence), siteName: data.siteName || "" };
  } catch {
    return null;
  }
}

// -> { locationConsentVersion, locationConsentText, privacyVersion, accepted }
// or null (offline / error - the consent screen says it can't load).
export async function fetchLocationConsent() {
  try {
    const res = await consentFn({});
    return res.data || null;
  } catch {
    return null;
  }
}

// Throws on failure (the consent screen shows the error).
export async function acceptLocationConsent({ locationConsentVersion, privacyVersion }) {
  await acceptFn({ locationConsentVersion, privacyVersion });
}
