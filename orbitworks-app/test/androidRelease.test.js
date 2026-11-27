// Android 1.1.6 release config (first Android build with the Employee App):
// push (FCM) for the real app only, no background location on Android, App
// Links for /j/ and /i/, and the Play internal-track submit profile. Plain
// Node, no Expo: node --test test/androidRelease.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const appJson = require("../app.json");
const eas = require("../eas.json");
const googleServices = require("../google-services.json");
const appConfig = require("../app.config.js");
const { alwaysLocationAvailable } = require("../lib/backgroundLocationRule");

const BG = "android.permission.ACCESS_BACKGROUND_LOCATION";

function resolve(env) {
  const keys = ["APP_VARIANT", "EXPO_PUBLIC_FIREBASE_ENV", "EAS_BUILD", "ORBITS_STRICT_ENV"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try {
    return appConfig({ config: structuredClone(appJson.expo) });
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const prod = resolve({ EXPO_PUBLIC_FIREBASE_ENV: "prod", EAS_BUILD: "true" });
const dev = resolve({ APP_VARIANT: "dev", EXPO_PUBLIC_FIREBASE_ENV: "dev" });

test("prod Android: FCM config file, real package", () => {
  assert.equal(prod.android.package, "com.orbitworks.app");
  assert.equal(prod.android.googleServicesFile, "./google-services.json");
});

test("google-services.json is the prod project and the real app only", () => {
  assert.equal(googleServices.project_info.project_id, "orbitworks-7ef59");
  const pkgs = googleServices.client.map((c) => c.client_info.android_client_info.package_name);
  assert.deepEqual(pkgs, ["com.orbitworks.app"]);
});

test("dev app never gets the prod google-services.json", () => {
  assert.equal(dev.android.package, "com.orbitworks.app.dev");
  assert.equal(dev.android.googleServicesFile, undefined);
});

test("no background location on Android; iOS keeps Always", () => {
  for (const cfg of [prod, dev]) {
    assert.ok(!cfg.android.permissions.includes(BG), "ACCESS_BACKGROUND_LOCATION listed");
    assert.ok(cfg.android.blockedPermissions.includes(BG), "ACCESS_BACKGROUND_LOCATION not blocked");
    assert.deepEqual(cfg.extra.backgroundLocation, { ios: true, android: false });
  }
  const loc = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-location")[1];
  assert.equal(loc.isAndroidBackgroundLocationEnabled, false);
  assert.equal(loc.isIosBackgroundLocationEnabled, true);
});

test("Always flow: iPhone yes, Android only when the build allows it", () => {
  assert.equal(alwaysLocationAvailable("ios", { ios: true, android: false }), true);
  assert.equal(alwaysLocationAvailable("android", { ios: true, android: false }), false);
  assert.equal(alwaysLocationAvailable("android", { ios: true, android: true }), true);
  assert.equal(alwaysLocationAvailable("ios", undefined), true);
  assert.equal(alwaysLocationAvailable("android", undefined), false);
  assert.equal(alwaysLocationAvailable("web", { ios: true, android: true }), false);
});

test("prod App Links: verified https orbitsworks.com /j/ and /i/", () => {
  const [filter] = prod.android.intentFilters;
  assert.equal(filter.autoVerify, true);
  assert.deepEqual(
    filter.data.map((d) => `${d.scheme}://${d.host}${d.pathPrefix}`),
    ["https://orbitsworks.com/j/", "https://orbitsworks.com/i/"]
  );
  assert.equal(prod.scheme, "orbitsworks");
});

test("Play submit: playInternal = internal track; production profile untouched", () => {
  assert.equal(eas.submit.playInternal.android.track, "internal");
  assert.equal(eas.submit.playInternal.ios, undefined);
  assert.equal(eas.submit.production.android.track, "production");
});
