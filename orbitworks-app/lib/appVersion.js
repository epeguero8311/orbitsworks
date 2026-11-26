// Task 6 (update banner, U1-U3) - pure rules, no React Native / Firebase
// imports, so test/appVersion.test.js runs them under `node --test`.
//
// appConfig/versions (Firestore, edited by hand after a store approval):
//   { ios: { latest: "1.1.7", min: "1.1.6" }, android: { latest, min } }
// - No doc / no entry for this platform / no latest -> nothing shows.
// - This app older than latest -> banner "A new version is available (1.1.7)
//   / You're on 1.1.6 [Update] [x]". [x] hides it until the next day (or
//   until a newer latest is set).
// - min set and this app older than min -> full-screen "Update to
//   continue" (no dismiss). Unset by default = never forced.

const VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;

export function isVersion(v) {
  return typeof v === "string" && VERSION.test(v);
}

// -1 / 0 / 1, numeric per part ("1.10" > "1.9"; "1.1" == "1.1.0").
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// This platform's { latest, min } from the doc; anything malformed = null.
export function platformEntry(doc, platform) {
  const e = doc && typeof doc === "object" ? doc[platform] : null;
  if (!e || typeof e !== "object") return { latest: null, min: null };
  return { latest: isVersion(e.latest) ? e.latest : null, min: isVersion(e.min) ? e.min : null };
}

// The local day "2026-11-25" (dismiss lasts until this changes).
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// What the dismiss [x] saves: the day + the latest it was dismissed for.
export function dismissValue(latest, nowMs) {
  return `${dayKey(nowMs)}|${latest}`;
}

// -> { kind: "none" | "banner" | "force", latest, current }
// current: this app's version; dismissed: the saved dismissValue (or null).
export function updateState({ current, platform, doc, dismissed, nowMs }) {
  const none = { kind: "none", latest: null, current };
  if (!isVersion(current) || (platform !== "ios" && platform !== "android")) return none;
  const { latest, min } = platformEntry(doc, platform);
  if (min && compareVersions(current, min) < 0) return { kind: "force", latest: latest || min, current };
  if (!latest || compareVersions(current, latest) >= 0) return none;
  if (dismissed && dismissed === dismissValue(latest, nowMs)) return { kind: "none", latest, current };
  return { kind: "banner", latest, current };
}

// Where [Update] goes. The dev app is TestFlight-only (opens TestFlight).
export const IOS_APP_STORE_ID = "6801155800";
export function storeUrl(platform, { variant, androidPackage } = {}) {
  if (platform === "ios") {
    return variant === "dev" ? "itms-beta://" : `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`;
  }
  return `https://play.google.com/store/apps/details?id=${androidPackage || "com.orbitworks.app"}`;
}
