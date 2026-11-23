// Employee App Phase 6 - which fix goes with a punch. CommonJS so
// test/punchLocation.test.js can run it in plain Node.
//
// A fix is { lat, lng, accuracyM, fixAtMs } (fixAtMs = when the phone got
// it, phone clock). The server checks the same ranges and the same window
// (functions/src/employeeClockValidators.ts, functions/src/lib/
// punchLocation.ts) - keep all three in sync by hand.
//
// At save time (never waits):
//   - the fresh fix started when the PIN / break screen opened, if it is
//     ready and not older than the server window (5 min before the punch)
//   - else the phone's last known fix, if at most 2 min old
//   - else null (the punch saves with no location)

const LOCATION_ACCURACY_MAX_M = 100000;
const FIX_MAX_BEFORE_PUNCH_MS = 5 * 60 * 1000;
const FIX_MAX_AFTER_PUNCH_MS = 60 * 1000;
const LAST_KNOWN_MAX_AGE_MS = 2 * 60 * 1000;

function isNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// expo-location position -> fix, or null when anything is off.
function toPunchFix(position) {
  const c = position && position.coords;
  if (!c) return null;
  const lat = c.latitude;
  const lng = c.longitude;
  const fixAtMs = Math.round(position.timestamp);
  if (!isNum(lat) || lat < -90 || lat > 90) return null;
  if (!isNum(lng) || lng < -180 || lng > 180) return null;
  if (!isNum(fixAtMs) || fixAtMs <= 0) return null;
  let accuracyM = null;
  if (isNum(c.accuracy) && c.accuracy >= 0) {
    if (c.accuracy > LOCATION_ACCURACY_MAX_M) return null;
    accuracyM = c.accuracy;
  }
  return { lat, lng, accuracyM, fixAtMs };
}

// Same window as the server: 5 min before to 1 min after the punch.
function fixFitsPunch(fix, punchMs) {
  if (!fix || !isNum(punchMs)) return false;
  const diff = fix.fixAtMs - punchMs;
  return diff >= -FIX_MAX_BEFORE_PUNCH_MS && diff <= FIX_MAX_AFTER_PUNCH_MS;
}

// fresh / lastKnown: fixes (or null). punchMs: the punch's phone time.
function pickPunchFix({ fresh, lastKnown, punchMs }) {
  if (fresh && fixFitsPunch(fresh, punchMs)) return fresh;
  if (lastKnown && fixFitsPunch(lastKnown, punchMs) && punchMs - lastKnown.fixAtMs <= LAST_KNOWN_MAX_AGE_MS) {
    return lastKnown;
  }
  return null;
}

module.exports = {
  LOCATION_ACCURACY_MAX_M,
  FIX_MAX_BEFORE_PUNCH_MS,
  FIX_MAX_AFTER_PUNCH_MS,
  LAST_KNOWN_MAX_AGE_MS,
  toPunchFix,
  fixFitsPunch,
  pickPunchFix,
};
