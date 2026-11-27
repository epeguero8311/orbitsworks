// Dynamic app config. app.json stays the base (the real OrbitsWorks app).
// APP_VARIANT=dev turns it into "OrbitsWorks Dev" (com.orbitworks.app.dev),
// the TestFlight-only test app that talks to orbitworks-dev-ew.
//
// Environment guard: a wrong app/Firebase combo throws here, which fails
// `eas build` (and `expo start`/`expo config`). Rules: config/envRules.js.

const { VARIANTS, checkBuildConfig, checkEasJson, resolveVariant } = require("./config/envRules");
const eas = require("./eas.json");

// EAS sets EAS_BUILD=true on its build servers. ORBITS_STRICT_ENV=1 makes a
// local run just as strict (set in the employeeDev profile).
function isStrict() {
  return process.env.EAS_BUILD === "true" || process.env.ORBITS_STRICT_ENV === "1";
}

function runGuard() {
  const strict = isStrict();
  const isDev = process.env.APP_VARIANT === "dev";
  const errors = [
    ...checkBuildConfig({
      appVariant: process.env.APP_VARIANT,
      firebaseEnvRaw: process.env.EXPO_PUBLIC_FIREBASE_ENV,
      strict,
    }),
    ...checkEasJson(eas, { requireDevSubmit: strict && isDev }),
  ];
  if (errors.length > 0) {
    throw new Error("ENVIRONMENT GUARD FAILED - build stopped:\n- " + errors.join("\n- "));
  }
}

// The links this variant opens: its own website host (universal links /
// Android app links) and its own custom scheme. Same shape for both apps.
function linkOverrides(config, variant) {
  const host = new URL(variant.joinLinks.appUrl).host;
  return {
    ...config,
    scheme: variant.joinLinks.scheme,
    ios: {
      ...config.ios,
      associatedDomains: [`applinks:${host}`],
    },
    android: {
      ...config.android,
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          // /j/ = crew code (QR), /i/ = email invite (Phase 3B).
          data: [
            { scheme: "https", host, pathPrefix: "/j/" },
            { scheme: "https", host, pathPrefix: "/i/" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
  };
}

// Which phones may ask for "Always" location (leave tracking), read from the
// expo-location plugin options in app.json so the native permission and the
// app's own prompts can never disagree. Android is off until the Play
// background location declaration is done; the app reads this through
// lib/backgroundLocation.js and never shows the Always flow where it's false.
function backgroundLocationFlags(config) {
  const entry = (config.plugins || []).find((p) => Array.isArray(p) && p[0] === "expo-location");
  const opts = (entry && entry[1]) || {};
  return {
    ios: opts.isIosBackgroundLocationEnabled === true,
    android: opts.isAndroidBackgroundLocationEnabled === true,
  };
}

// Firebase Android config for push (FCM). Only the real app: the file is the
// prod project's (orbitworks-7ef59) and names com.orbitworks.app only, so
// the dev app (com.orbitworks.app.dev) must not get it - its Gradle build
// would fail on the package name, and it would point at the wrong project.
const PROD_GOOGLE_SERVICES_FILE = "./google-services.json";

function devOverrides(config) {
  const dev = VARIANTS.dev;
  return {
    ...config,
    name: dev.name,
    ios: { ...config.ios, bundleIdentifier: dev.bundleId },
    android: { ...config.android, package: dev.bundleId },
  };
}

module.exports = ({ config }) => {
  runGuard();
  const variant = resolveVariant(process.env.APP_VARIANT);
  const base = {
    ...config,
    android: {
      ...config.android,
      // Brand blue behind the adaptive icon (was Expo's default #E6F4FE).
      adaptiveIcon: { ...config.android.adaptiveIcon, backgroundColor: "#3b6fe0" },
    },
  };
  const named =
    variant.key === "dev"
      ? devOverrides(base)
      : { ...base, android: { ...base.android, googleServicesFile: PROD_GOOGLE_SERVICES_FILE } };
  const out = variant.joinLinks ? linkOverrides(named, variant) : named;
  const extra = { ...out.extra, appVariant: variant.key, backgroundLocation: backgroundLocationFlags(out) };
  // Only builds that take crew codes get joinLinks (a null here comes out
  // of expo config as {}, so leave the key off entirely).
  if (variant.joinLinks) extra.joinLinks = variant.joinLinks;
  return { ...out, extra };
};
