// Prod crew code / invite links (prod-readiness B4): the values in
// apphosting.yaml produce a real apple-app-site-association for the real
// app only, the landing pages get a safe install link, and the dev file
// never claims the real app. No Firebase. Run from orbitworks-web:
//   node --test test/prodAppLinks.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

// lib/appLinks.ts imports "server-only" (a Next.js build-time guard); plain
// Node has no such package, so it resolves to an empty module here.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return next(specifier, context);
  },
});
const { buildAppleAppSiteAssociation, buildAssetLinks, safeInstallUrl, getJoinLandingConfig } = await import("../lib/appLinks.ts");

// Play Console > App integrity > App signing key for com.orbitworks.app.
const PLAY_APP_SIGNING_SHA256 = "0D:02:E0:A4:7B:DE:B8:BE:FA:2F:9B:37:E0:60:B6:4E:27:D6:07:47:CA:73:63:F7:2F:43:3B:2C:08:38:F6:A9";

function yamlValue(file, name) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const m = new RegExp("- variable: " + name + "\\s*\\n\\s+value:\\s*\"([^\"]*)\"").exec(text);
  return m ? m[1] : undefined;
}

test("prod apphosting.yaml: AASA lists the real app for /j/ and /i/", () => {
  const ids = yamlValue("apphosting.yaml", "APP_LINKS_IOS_APP_IDS");
  assert.equal(ids, "6ZU7MHT284.com.orbitworks.app");
  const body = JSON.stringify(buildAppleAppSiteAssociation(ids));
  assert.match(body, /6ZU7MHT284\.com\.orbitworks\.app"/);
  assert.doesNotMatch(body, /\.dev"/);
  assert.match(body, /\/j\//);
  assert.match(body, /\/i\//);
});

test("prod apphosting.yaml: assetlinks.json is the real Android app + Play signing key", () => {
  const pkg = yamlValue("apphosting.yaml", "APP_LINKS_ANDROID_PACKAGE");
  const sha = yamlValue("apphosting.yaml", "APP_LINKS_ANDROID_SHA256");
  assert.equal(pkg, "com.orbitworks.app");
  assert.equal(sha, PLAY_APP_SIGNING_SHA256);
  assert.deepEqual(buildAssetLinks(pkg, sha), [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "com.orbitworks.app", sha256_cert_fingerprints: [PLAY_APP_SIGNING_SHA256] },
    },
  ]);
  // The dev site never claims the real Android app.
  assert.notEqual(yamlValue("apphosting.orbitworks_dev.yaml", "APP_LINKS_ANDROID_PACKAGE"), "com.orbitworks.app");
});

test("prod and dev claim different apps, schemes and hosts", () => {
  assert.equal(yamlValue("apphosting.yaml", "JOIN_APP_SCHEME"), "orbitsworks");
  assert.equal(yamlValue("apphosting.orbitworks_dev.yaml", "JOIN_APP_SCHEME"), "orbitsworks-dev");
  assert.equal(yamlValue("apphosting.yaml", "NEXT_PUBLIC_APP_URL"), "https://orbitsworks.com");
  assert.equal(yamlValue("apphosting.orbitworks_dev.yaml", "APP_LINKS_IOS_APP_IDS"), "6ZU7MHT284.com.orbitworks.app.dev");
});

test("install link: only https store pages, else plain text", () => {
  assert.equal(safeInstallUrl(yamlValue("apphosting.yaml", "JOIN_APP_INSTALL_URL")), "https://apps.apple.com/app/id6801155800");
  assert.equal(safeInstallUrl(""), null);
  assert.equal(safeInstallUrl("javascript:alert(1)"), null);
  assert.equal(safeInstallUrl("http://apps.apple.com/app/id1"), null);
  assert.equal(safeInstallUrl("https://evil.example/app"), null);
  process.env.JOIN_APP_SCHEME = "orbitsworks";
  process.env.JOIN_APP_INSTALL_URL = "https://apps.apple.com/app/id6801155800";
  const c = getJoinLandingConfig();
  assert.equal(c.scheme, "orbitsworks");
  assert.equal(c.installUrl, "https://apps.apple.com/app/id6801155800");
});
