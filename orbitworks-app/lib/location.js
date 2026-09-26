// Long enough for a real GPS/network fix on most devices, short enough
// that a stuck permission prompt or a cold GPS lock on bad signal never
// meaningfully delays a clock-in - see queueClockEvent's Promise.all with
// the camera capture, which runs concurrently with this.
const TIMEOUT_MS = 6000;

// Promise.race never cancels the promise that loses the race - if the
// real GPS/permission call eventually rejects AFTER the timeout has
// already resolved this race with null, that rejection would otherwise
// have no handler and surface as an unhandled promise rejection (visible
// in Sentry as noise for something that's working exactly as designed).
// The standalone .catch() attaches a silent handler to the original
// promise without changing what Promise.race itself sees.
function withTimeout(promise, ms) {
  promise.catch(() => {});
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function getBestEffortLocation(Location) {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      const requested = await withTimeout(Location.requestForegroundPermissionsAsync(), TIMEOUT_MS);
      status = requested?.status;
    }
    if (status !== "granted") return null;

    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      TIMEOUT_MS
    );
    if (!position) return null;

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: position.coords.accuracy ?? null,
    };
  } catch (err) {
    console.log("[location] best-effort fix failed:", err.message);
    return null;
  }
}

// Core companies must never attempt a fix at all - no permission prompt,
// no capture - so their clock events carry no location field whatsoever
// (undefined, same as a pre-feature event) rather than a null one. Only
// null vs. an actual fix distinguishes "attempted but no fix" (shows
// "Location not shared") from "never attempted" (shows nothing) once this
// reaches clockQueue.js/queueSync.js - see the comment there.
//
// This is the only exported entry point, and it is the single place that
// guarantees location capture can never take down a clock-in: every
// failure - denied permission, no GPS fix in time, bad signal, or even
// expo-location's native module itself being unavailable - resolves to
// null/undefined here rather than rejecting. expo-location is required()
// lazily, inside this function, rather than imported at module scope,
// because its native binding calls requireNativeModule() at import time,
// which throws synchronously if the installed binary doesn't have the
// module linked in. A top-level import would risk that throw during the
// app's initial bundle evaluation, before any try/catch could run;
// deferring it here means that failure can only ever disable location
// capture, never anything else.
export async function getBestEffortLocationIfPro(isPro) {
  if (!isPro) return undefined;
  try {
    const Location = require("expo-location");
    return await getBestEffortLocation(Location);
  } catch (err) {
    console.log("[location] expo-location unavailable:", err.message);
    return null;
  }
}
