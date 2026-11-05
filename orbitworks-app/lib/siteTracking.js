import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { uptimeNow } from "./clockAnchor";
import { readHomeCache } from "./employeeHomeCache";
import { getAlwaysLocationStatus } from "./locationPermission";
import { ensureAndroidChannel, ensureNotificationHandler, loadNotifications, NOTIFICATION_CHANNEL_ID } from "./notificationsModule";
import { kickPunchSync } from "./punchQueueEvents";
import { fetchShiftFence } from "./siteExitApi";
import {
  appStoppedGapStart,
  exitNotification,
  foregroundFix,
  madeOnThisPhone,
  regionEvent,
  startState,
  stop,
  trackingOff,
  trackingOn,
} from "./siteExitLogic";
import { deleteFenceState, enqueueSiteExit, listFenceStates, readFenceState, saveFenceState, unqueueSiteExit } from "./siteExitStore";
import { EXIT_MIN_BUFFER_M, toFence } from "./validators/siteExit";
import { toPunchFix } from "./validators/punchLocation";

// Employee App Phase 8 - leave tracking on the phone (Pro). The rules are in
// lib/siteExitLogic.js; this file is the Expo side: the OS geofence region
// (expo-location + the task in lib/siteFenceTask.js), one fresh fix per
// event, the local "You have left the job site" notification, and the
// site_fence / site_exit_queue tables.
//
// FLAG ONLY. Nothing here is ever awaited by a punch, and nothing here can
// block, change or end a punch. Every function catches its own errors.
//
// Region-only (D7): no continuous background location and no Android
// foreground service. One region per tracked shift, radius = the shift's
// locked radius + 25 m (the exit buffer), so the OS wakes the app around
// where an exit could count.
//
// Tracked (D11): only a shift whose clock-in was made on this phone, for a
// Pro company, at a geofenced site, while clocked in or on a break. The
// fence comes from the server when the clock-in syncs (punch result), or
// until then from the home site the phone saved (D8 - the server re-checks
// every exit against the real site anyway).

export const SITE_FENCE_TASK = "orbitworks-site-fence";
// The background time an OS region event gives is short - one try (E4).
const REGION_FIX_TIMEOUT_MS = 8000;
const FOREGROUND_FIX_TIMEOUT_MS = 6000;
const NOTIFY_PREFIX = "siteExit:";
const SERVER_FENCE_PREFIX = "siteExitFence:v1:";
const CONSENT_PREFIX = "locationConsent:v1:";

function loadLocation() {
  return require("expo-location");
}

const newId = () => Crypto.randomUUID();

// All state changes one after the other (a region event can land while the
// app is checking on the way to the front).
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

function withTimeout(promise, ms) {
  promise.catch(() => {});
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

// One fresh fix (never prompts). null on timeout / no permission.
async function takeFix(highAccuracy, timeoutMs) {
  try {
    const Location = loadLocation();
    const accuracy = highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced;
    const position = await withTimeout(Location.getCurrentPositionAsync({ accuracy }), timeoutMs);
    return position ? toPunchFix(position) : null;
  } catch {
    return null;
  }
}

// ---- notifications (D4: local, right away, works offline) ----

async function scheduleExitNotification({ exitId, atMs, siteName }) {
  try {
    const Notifications = loadNotifications();
    if (!Notifications) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    ensureNotificationHandler(Notifications);
    await ensureAndroidChannel(Notifications);
    const text = exitNotification(siteName);
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFY_PREFIX + exitId,
      content: { title: text.title, body: text.body, sound: true, data: { siteExit: exitId } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Math.max(atMs, Date.now() + 1000)),
        channelId: NOTIFICATION_CHANNEL_ID,
      },
    });
  } catch (e) {
    console.log("[siteTracking] notify failed:", e.message);
  }
}

async function cancelExitNotification(exitId) {
  try {
    const Notifications = loadNotifications();
    if (Notifications && exitId) await Notifications.cancelScheduledNotificationAsync(NOTIFY_PREFIX + exitId);
  } catch {
    // Already shown or never scheduled.
  }
}

async function applyActions(actions) {
  let queued = false;
  for (const a of actions) {
    try {
      if (a.type === "queue") {
        await enqueueSiteExit(a.row);
        queued = true;
      } else if (a.type === "unqueue") await unqueueSiteExit(a.exitId);
      else if (a.type === "notify") await scheduleExitNotification(a);
      else if (a.type === "cancelNotify") await cancelExitNotification(a.exitId);
    } catch (e) {
      console.log("[siteTracking] action failed:", a.type, e.message);
    }
  }
  return queued;
}

async function commit(result) {
  await saveFenceState(result.state);
  const queued = await applyActions(result.actions);
  if (queued) kickPunchSync();
  return result.state;
}

// ---- the OS region ----

async function armRegion(state) {
  try {
    const Location = loadLocation();
    await Location.startGeofencingAsync(SITE_FENCE_TASK, [
      {
        identifier: state.clockInEventId,
        latitude: state.fence.lat,
        longitude: state.fence.lng,
        radius: state.fence.radiusM + EXIT_MIN_BUFFER_M,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);
    return true;
  } catch (e) {
    console.log("[siteTracking] arm failed:", e.message);
    return false;
  }
}

async function regionArmed() {
  try {
    return await loadLocation().hasStartedGeofencingAsync(SITE_FENCE_TASK);
  } catch {
    return false;
  }
}

async function disarmRegion() {
  try {
    const Location = loadLocation();
    if (await Location.hasStartedGeofencingAsync(SITE_FENCE_TASK)) await Location.stopGeofencingAsync(SITE_FENCE_TASK);
  } catch {
    // Nothing armed.
  }
}

// ---- consent + server fence, saved on the phone ----

export async function isLocationConsentAccepted(companyId, employeeId) {
  try {
    return (await AsyncStorage.getItem(`${CONSENT_PREFIX}${companyId}:${employeeId}`)) === "1";
  } catch {
    return false;
  }
}

export async function setLocationConsentAccepted(companyId, employeeId, accepted) {
  try {
    await AsyncStorage.setItem(`${CONSENT_PREFIX}${companyId}:${employeeId}`, accepted ? "1" : "0");
  } catch {
    // Asked again next time.
  }
}

async function serverFenceFor(clockInEventId) {
  try {
    const raw = await AsyncStorage.getItem(SERVER_FENCE_PREFIX + clockInEventId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// The punch queue calls this when a clock-in synced (fence = the punch
// result's, null = not tracked). Saved for the Home check, and applied at
// once to a shift already being tracked with the guessed fence (D8).
export function onClockInSynced({ requestId, fence }) {
  return serial(async () => {
    try {
      const real = toFence(fence);
      await AsyncStorage.setItem(SERVER_FENCE_PREFIX + requestId, JSON.stringify({ fence: real })).catch(() => {});
      const state = await readFenceState(requestId);
      if (!state || state.status !== "tracking") return;
      if (!real) {
        await stopState(state);
        return;
      }
      const updated = { ...state, fence: real, fenceSource: "server" };
      await saveFenceState(updated);
      if (state.armed) await armRegion(updated);
    } catch (e) {
      console.log("[siteTracking] clock-in sync update failed:", e.message);
    }
  });
}

// Ends tracking for a shift. forget = the shift is over on this phone
// (clock-out seen, signed out): the row goes. Otherwise (the server says
// not tracked, a drop to Core) the row stays as "stopped", so the shift is
// never started again until it ends.
async function stopState(state, { forget = false } = {}) {
  const stopped = await commit(stop(state, { nowMs: Date.now() }));
  if (forget) {
    await deleteFenceState(state.clockInEventId);
    await AsyncStorage.removeItem(SERVER_FENCE_PREFIX + state.clockInEventId).catch(() => {});
  } else {
    await saveFenceState({ ...stopped, armed: false });
  }
  const left = (await listFenceStates()).filter((s) => s.status === "tracking" && s.armed);
  if (left.length === 0) await disarmRegion();
}

// ---- the background region event (lib/siteFenceTask.js) ----

export function handleRegionEvent(identifier, kind) {
  return serial(async () => {
    try {
      const state = await readFenceState(identifier);
      if (!state || state.status !== "tracking") {
        // A region from a shift that ended: nothing to watch any more.
        if ((await listFenceStates()).every((s) => s.status !== "tracking")) await disarmRegion();
        return;
      }
      // E4: one fresh high-accuracy fix inside the time the OS gives.
      const fix = await takeFix(true, REGION_FIX_TIMEOUT_MS);
      await commit(regionEvent(state, { kind, fix, nowMs: Date.now(), newId }));
    } catch (e) {
      console.log("[siteTracking] region event failed:", e.message);
    }
  });
}

// ---- the foreground check (lib/hooks/useSiteTracking.js) ----

// Can this phone track right now: the location consent on this phone and
// Always location.
async function canTrackNow(companyId, employeeId) {
  const [consent, always] = await Promise.all([isLocationConsentAccepted(companyId, employeeId), getAlwaysLocationStatus()]);
  return consent && always === "always";
}

async function startFor(home) {
  const saved = await serverFenceFor(home.shiftInId);
  let fence = saved ? saved.fence : undefined;
  let fenceSource = "server";
  if (fence === undefined) {
    // Not synced yet: the home site's fence the phone saved (D8).
    const homeSite = await readHomeCache("homeSite", home.companyId, home.employeeId);
    fence = toFence(homeSite && homeSite.fence);
    fenceSource = "cached";
  }
  if (!fence) return null;
  const canTrack = await canTrackNow(home.companyId, home.employeeId);
  const state = await commit(
    startState({
      clockInEventId: home.shiftInId,
      companyId: home.companyId,
      employeeId: home.employeeId,
      siteName: home.siteName,
      fence,
      fenceSource,
      clockInFix: home.clockInFix,
      clockInMs: home.shiftInMs || Date.now(),
      canTrack,
      newId,
    })
  );
  if (canTrack && (await armRegion(state))) await saveFenceState({ ...state, armed: true });
  return state;
}

// home: { companyId, employeeId, status, shiftInId, shiftInMs, siteName,
// isPro, punches, clockInFix }. Called when Home's status changes and every
// time the app comes to the front.
export function checkSiteTracking(home) {
  return serial(async () => {
    try {
      const all = await listFenceStates();
      const clockedIn = home.status === "in" || home.status === "break";
      // Anything not this employee's current shift is over on this phone.
      for (const s of all) {
        const current = clockedIn && s.clockInEventId === home.shiftInId && s.employeeId === home.employeeId;
        if (!current && s.employeeId === home.employeeId) await stopState(s, { forget: true });
      }
      if (!clockedIn || !home.shiftInId) return;

      let state = await readFenceState(home.shiftInId);
      if (!state) {
        if (!home.isPro || !madeOnThisPhone(home.shiftInId, home.punches || [])) return;
        await startFor(home);
        return;
      }
      if (state.status !== "tracking") return;
      // D12: a drop to Core stops tracking.
      if (!home.isPro) {
        await stopState(state);
        return;
      }

      const nowMs = Date.now();
      if (!(await canTrackNow(home.companyId, home.employeeId))) {
        state = await commit(trackingOff(state, { reason: "permission", atMs: nowMs, newId }));
        await disarmRegion();
        await saveFenceState({ ...state, armed: false });
        return;
      }
      state = await commit(trackingOn(state, { atMs: nowMs }));
      if (state.armed && !(await regionArmed())) {
        // The OS lost the region (restart, app force-stopped): a gap from
        // when it most likely stopped until now.
        const gapStart = appStoppedGapStart({ lastAliveMs: state.lastAliveMs, nowMs, uptimeMs: await uptimeNow() });
        state = await commit(trackingOff(state, { reason: "appStopped", atMs: gapStart, newId }));
        state = await commit(trackingOn(state, { atMs: nowMs }));
      }
      if (!(await regionArmed())) {
        const armed = await armRegion(state);
        state = { ...state, armed };
        await saveFenceState(state);
      }

      // The server's word: toggle off / Core / shift over = stop (D12).
      const server = await fetchShiftFence(home.shiftInId);
      if (server && !server.tracking) {
        await stopState(state);
        return;
      }
      if (server && server.fence && JSON.stringify(server.fence) !== JSON.stringify(state.fence)) {
        state = { ...state, fence: server.fence, fenceSource: "server" };
        await saveFenceState(state);
        await armRegion(state);
      }

      const fix = await takeFix(false, FOREGROUND_FIX_TIMEOUT_MS);
      await commit(foregroundFix(state, { fix, nowMs: Date.now(), newId }));
    } catch (e) {
      console.log("[siteTracking] check failed:", e.message);
    }
  });
}

// The server answered tracking: false for this shift (queue sync).
export function stopShiftTracking(clockInEventId) {
  return serial(async () => {
    try {
      const state = await readFenceState(clockInEventId);
      if (state) await stopState(state);
    } catch (e) {
      console.log("[siteTracking] stop failed:", e.message);
    }
  });
}

// Log out mid-shift: a "tracking off" (signedOut) for every shift this
// employee is tracked on, then nothing more on this phone (D13).
export function signOutSiteTracking(companyId, employeeId) {
  return serial(async () => {
    try {
      for (const s of await listFenceStates()) {
        if (s.employeeId !== employeeId || s.companyId !== companyId) continue;
        if (s.status === "tracking") await commit(trackingOff(s, { reason: "signedOut", atMs: Date.now(), newId }));
        const latest = await readFenceState(s.clockInEventId);
        if (latest) await stopState(latest, { forget: true });
      }
      await disarmRegion();
    } catch (e) {
      console.log("[siteTracking] sign-out failed:", e.message);
    }
  });
}

// Is a shift of this employee tracked but not able to track (Home banner).
export async function trackingBlocked(companyId, employeeId) {
  try {
    const states = await listFenceStates();
    return states.some((s) => s.companyId === companyId && s.employeeId === employeeId && s.status === "tracking" && s.openOff && s.openOff.reason === "permission");
  } catch {
    return false;
  }
}
