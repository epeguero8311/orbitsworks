// Task 6 (update banner, U2/U3) - the website side of appConfig/versions:
// the Devices list shows each shared device's app version and an
// "Outdated" tag. Mirrors the app's lib/appVersion.js (compareVersions) -
// keep the two in sync by hand. No imports, so plain Node tests run it.
//
// appConfig/versions = { ios: { latest, min }, android: { latest, min } },
// edited by hand after a store approval (no client writes).

export type PlatformVersions = { latest: string | null; min: string | null };
export type AppVersionsConfig = { ios: PlatformVersions; android: PlatformVersions } | null;
export type AppPlatform = "ios" | "android";

// Devices that never report a version run a build from before 1.1.6
// (the version reporting shipped in 1.1.6).
export const FIRST_REPORTING_VERSION = "1.1.6";

const VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;

export function isVersion(v: unknown): v is string {
  return typeof v === "string" && VERSION.test(v);
}

// -1 / 0 / 1, numeric per part ("1.10" > "1.9"; "1.1" == "1.1.0").
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function readPlatform(raw: unknown): PlatformVersions {
  const e = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { latest: isVersion(e.latest) ? e.latest : null, min: isVersion(e.min) ? e.min : null };
}

// The Firestore doc -> config; a missing doc = null (nothing is "outdated").
export function readAppVersionsConfig(data: unknown): AppVersionsConfig {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return { ios: readPlatform(d.ios), android: readPlatform(d.android) };
}

// What the Devices list shows for one device.
//  version: what it reported (null = an older build that doesn't report)
//  platform: the device's platform (missing -> ios; kiosks are iPads)
// -> { text: "1.1.6" | "Older than 1.1.6", outdated }
export function deviceVersionLabel(
  version: string | null | undefined,
  platform: string | null | undefined,
  config: AppVersionsConfig
): { text: string; outdated: boolean } {
  const known = isVersion(version) ? version : null;
  const text = known ?? `Older than ${FIRST_REPORTING_VERSION}`;
  const latest = config ? config[platform === "android" ? "android" : "ios"].latest : null;
  if (!latest) return { text, outdated: false };
  const outdated = known ? compareVersions(known, latest) < 0 : compareVersions(FIRST_REPORTING_VERSION, latest) <= 0;
  return { text, outdated };
}
