// Employee App Phase 6 - getting a fix for a punch, without React Native
// imports so test/punchFix.test.js can run it in plain Node. Wired to
// expo-location in lib/punchLocation.js.
//
// startPunchFixWith starts at once (PIN / break screen open) and returns
// { take(punchMs) }. take never waits: it returns the best fix ready right
// now (lib/validators/punchLocation.js pickPunchFix) or null. Nothing here
// ever asks for permission, throws, or blocks a punch.
const { toPunchFix, pickPunchFix, LAST_KNOWN_MAX_AGE_MS } = require("./validators/punchLocation");

const FIX_TIMEOUT_MS = 6000;

// Resolves null after ms. The real call keeps running, its result is
// ignored (a late rejection is swallowed, never unhandled).
function withTimeout(promise, ms) {
  promise.catch(() => {});
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

// deps: { loadLocation() -> expo-location, getStatus() -> { status } }.
function startPunchFixWith({ loadLocation, getStatus, timeoutMs = FIX_TIMEOUT_MS }) {
  let fresh = null;
  let lastKnown = null;

  const done = (async () => {
    try {
      const { status } = (await getStatus()) || {};
      if (status !== "granted") return;
      const Location = loadLocation();
      const last = Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS })
        .then((p) => {
          lastKnown = toPunchFix(p);
        })
        .catch(() => {});
      const current = withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((p) => {
          fresh = toPunchFix(p);
        }),
        timeoutMs
      ).catch(() => {});
      await Promise.all([last, current]);
    } catch {
      // No location module, no permission, no fix: the punch has none.
    }
  })();

  return {
    take: (punchMs) => pickPunchFix({ fresh, lastKnown, punchMs }),
    // Tests only: resolves once both lookups ended (or timed out).
    done,
  };
}

module.exports = { startPunchFixWith, FIX_TIMEOUT_MS };
