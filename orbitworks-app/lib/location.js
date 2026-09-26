import * as Location from "expo-location";

// Long enough for a real GPS/network fix on most devices, short enough
// that a stuck permission prompt or a cold GPS lock on bad signal never
// meaningfully delays a clock-in - see queueClockEvent's Promise.all with
// the camera capture, which runs concurrently with this.
const TIMEOUT_MS = 6000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// Core companies must never attempt a fix at all - no permission prompt,
// no capture - so their clock events carry no location field whatsoever
// (undefined, same as a pre-feature event) rather than a null one. Only
// null vs. an actual fix distinguishes "attempted but no fix" (shows
// "Location not shared") from "never attempted" (shows nothing) once this
// reaches clockQueue.js/queueSync.js - see the comment there. Every
// Geolocation-capturing screen should call this instead of
// getBestEffortLocation directly.
export async function getBestEffortLocationIfPro(isPro) {
  if (!isPro) return undefined;
  return getBestEffortLocation();
}

// Best-effort only - every failure path (permission denied, no fix in
// time, unexpected error) resolves to null rather than throwing. Callers
// pass the result straight through to the offline queue; location is
// never allowed to block or fail a clock event. Call this once per user
// action (not per employee in a supervisor-override batch) - a GPS fix
// doesn't change employee to employee in the same batch.
export async function getBestEffortLocation() {
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
