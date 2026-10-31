import * as Sentry from "@sentry/react-native";

// Launch timing (fast launch step 5). Times are ms since this module loaded,
// which is the first import in App.js - i.e. JS start, after the native
// splash appeared. Marks:
//   authReady     - sign-in known (AuthContext loading=false)
//   splashHidden  - the JS splash finished fading out (home is on screen)
//   homeData      - home's employee/status data loaded (counts shown)
//   alertsLoaded  - first alerts snapshot
// plus how blocked the JS thread was. A blocked JS thread is what makes
// taps do nothing: maxJsBlockMs is the longest stall seen, and
// maxJsBlockAfterSplashMs the longest one once home was on screen.
// Summary: one "[launch-timing]" log line, a Settings readout on TestFlight/
// dev builds, and one Sentry message when the launch was slow.

const startedAt = Date.now();
const marks = {};
const counts = {};
let maxJsBlockMs = 0;
let maxJsBlockAfterSplashMs = 0;
let summary = null;
const listeners = new Set();

const TICK_MS = 100;
const WATCH_MS = 30000;
const SLOW_HOME_DATA_MS = 5000;
const SLOW_JS_BLOCK_MS = 1000;

let lastTick = Date.now();
const lagTimer = setInterval(() => {
  const now = Date.now();
  const blocked = now - lastTick - TICK_MS;
  lastTick = now;
  if (blocked > maxJsBlockMs) maxJsBlockMs = blocked;
  if (marks.splashHidden != null && blocked > maxJsBlockAfterSplashMs) maxJsBlockAfterSplashMs = blocked;
  if (now - startedAt > WATCH_MS) finish("timeout");
}, TICK_MS);

function finish(reason) {
  if (summary) return;
  clearInterval(lagTimer);
  summary = {
    ...marks,
    ...counts,
    maxJsBlockMs: Math.max(0, maxJsBlockMs),
    maxJsBlockAfterSplashMs: Math.max(0, maxJsBlockAfterSplashMs),
    end: reason,
  };
  console.log("[launch-timing]", JSON.stringify(summary));
  // No homeData = signed out (Login screen) or offline: not a slow launch.
  const slow =
    (summary.homeData != null && summary.homeData > SLOW_HOME_DATA_MS) ||
    summary.maxJsBlockAfterSplashMs > SLOW_JS_BLOCK_MS;
  if (slow) {
    Sentry.captureMessage("launch:slow", { level: "warning", tags: { area: "launch" }, contexts: { launch: summary } });
  }
  listeners.forEach((fn) => fn(summary));
}

export function markLaunch(name) {
  if (summary || marks[name] != null) return;
  marks[name] = Date.now() - startedAt;
  // Wait a few seconds past the last mark so a stall right after home
  // data lands is still measured.
  if (marks.homeData != null && marks.splashHidden != null) {
    setTimeout(() => finish("done"), 3000);
  }
}

export function noteLaunchCount(name, value) {
  if (summary || counts[name] != null) return;
  counts[name] = value;
}

export function getLaunchSummary() {
  return summary;
}

export function subscribeLaunchSummary(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
