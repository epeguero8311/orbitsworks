import "server-only";

// Universal links (iOS) and App Links (Android) for crew code QR links
// (/j/{token}). Built from server env vars so each site only advertises
// its own apps:
//   APP_LINKS_IOS_APP_IDS      comma list of TEAMID.bundle.id
//   APP_LINKS_ANDROID_PACKAGE  e.g. com.orbitworks.app.dev
//   APP_LINKS_ANDROID_SHA256   comma list of signing cert fingerprints
// Unset (prod today) = the files 404 and no app opens /j links.

const IOS_APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const ANDROID_PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function envList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export interface AppleAppSiteAssociation {
  applinks: { details: { appIDs: string[]; components: { "/": string; comment: string }[] }[] };
}

export function buildAppleAppSiteAssociation(rawIds: string | undefined): AppleAppSiteAssociation | null {
  const ids = envList(rawIds).filter((id) => IOS_APP_ID.test(id));
  if (ids.length === 0) return null;
  return {
    applinks: {
      details: [{ appIDs: ids, components: [{ "/": "/j/*", comment: "Crew code links" }] }],
    },
  };
}

export interface AssetLinkStatement {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
}

export function buildAssetLinks(rawPackage: string | undefined, rawFingerprints: string | undefined): AssetLinkStatement[] | null {
  const pkg = (rawPackage ?? "").trim();
  const fingerprints = envList(rawFingerprints).map((f) => f.toUpperCase()).filter((f) => SHA256_FINGERPRINT.test(f));
  if (!ANDROID_PACKAGE.test(pkg) || fingerprints.length === 0) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints },
    },
  ];
}

// What the /j page tells people about the app. Server env vars:
//   JOIN_APP_SCHEME        custom scheme for "Open in the app" (dev:
//                          orbitsworks-dev). Unset = no button.
//   JOIN_APP_NAME          default "OrbitsWorks"
//   JOIN_APP_INSTALL_FROM  default "the App Store or Google Play"
export interface JoinLandingConfig {
  appName: string;
  installFrom: string;
  scheme: string | null;
}

const SCHEME = /^[a-z][a-z0-9+.-]{1,30}$/;

export function getJoinLandingConfig(): JoinLandingConfig {
  const scheme = (process.env.JOIN_APP_SCHEME ?? "").trim();
  return {
    appName: (process.env.JOIN_APP_NAME ?? "").trim() || "OrbitsWorks",
    installFrom: (process.env.JOIN_APP_INSTALL_FROM ?? "").trim() || "the App Store or Google Play",
    scheme: SCHEME.test(scheme) ? scheme : null,
  };
}

// Served as JSON, no redirect, short cache so a config change shows up fast.
export function appLinkResponse(body: unknown): Response {
  if (body === null) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });
}
