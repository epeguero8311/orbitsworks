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

function devOverrides(config) {
  const dev = VARIANTS.dev;
  const host = new URL(dev.joinLinks.appUrl).host;
  return {
    ...config,
    name: dev.name,
    scheme: dev.joinLinks.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: dev.bundleId,
      associatedDomains: [`applinks:${host}`],
    },
    android: {
      ...config.android,
      package: dev.bundleId,
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [{ scheme: "https", host, pathPrefix: "/j/" }],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
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
  const out = variant.key === "dev" ? devOverrides(base) : base;
  const extra = { ...out.extra, appVariant: variant.key };
  // Only builds that take crew codes get joinLinks (a null here comes out
  // of expo config as {}, so leave the key off entirely).
  if (variant.joinLinks) extra.joinLinks = variant.joinLinks;
  return { ...out, extra };
};
