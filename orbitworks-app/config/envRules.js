// Which app may talk to which Firebase project. One file, read by:
// - app.config.js at build time (a bad combo FAILS the build)
// - lib/envGuard.js at launch (a bad combo shows a blocking screen and
//   makes no Firebase calls)
// - test/envRules.test.js
// CommonJS (not import/export) so plain Node can require it from
// app.config.js. No React Native imports here.

const FIREBASE_PROJECTS = {
  dev: "orbitworks-dev-ew",
  prod: "orbitworks-7ef59",
};

// App Store Connect app of the REAL OrbitsWorks listing. The dev app's
// submit profile must never point here.
const PROD_ASC_APP_ID = "6801155800";

const DEV_APP_URL = "https://orbitsworks-backend--orbitworks-dev-ew.us-central1.hosted.app";

const VARIANTS = {
  prod: {
    key: "prod",
    name: "OrbitsWorks",
    bundleId: "com.orbitworks.app",
    firebaseEnv: "prod",
    updatesChannel: "production",
    easBuildProfile: "production",
    joinLinks: null,
  },
  dev: {
    key: "dev",
    name: "OrbitsWorks Dev",
    bundleId: "com.orbitworks.app.dev",
    firebaseEnv: "dev",
    updatesChannel: "employee-dev",
    easBuildProfile: "employeeDev",
    // Crew code links this app opens. A different scheme from prod so a
    // dev link can never open the real app.
    joinLinks: { appUrl: DEV_APP_URL, scheme: "orbitsworks-dev" },
  },
};

// Same rule lib/firebase.js uses: only the exact string "prod" means prod.
function resolveFirebaseEnv(raw) {
  return raw === "prod" ? "prod" : "dev";
}

// APP_VARIANT: unset or "prod" -> real app, "dev" -> OrbitsWorks Dev.
function resolveVariant(raw) {
  if (raw === undefined || raw === "" || raw === "prod") return VARIANTS.prod;
  if (raw === "dev") return VARIANTS.dev;
  return null;
}

// Build-time check. strict = a real build (EAS sets EAS_BUILD=true on its
// servers; ORBITS_STRICT_ENV=1 forces it locally). Returns error strings.
function checkBuildConfig({ appVariant, firebaseEnvRaw, strict }) {
  const variant = resolveVariant(appVariant);
  if (!variant) return [`Unknown APP_VARIANT "${appVariant}". Use "dev" or leave it unset.`];
  const project = FIREBASE_PROJECTS[resolveFirebaseEnv(firebaseEnvRaw)];
  const errors = [];

  if (variant.key === "dev") {
    // Dev app: always checked, even for a local `expo start`.
    if (firebaseEnvRaw !== "dev") {
      errors.push(`${variant.bundleId} needs EXPO_PUBLIC_FIREBASE_ENV=dev (got "${firebaseEnvRaw ?? "(unset)"}").`);
    }
    if (project !== FIREBASE_PROJECTS.dev) {
      errors.push(`${variant.bundleId} must use Firebase project ${FIREBASE_PROJECTS.dev} (got ${project}).`);
    }
  } else if (strict) {
    // Real app in a real build: must be prod Firebase.
    if (firebaseEnvRaw !== "prod" || project !== FIREBASE_PROJECTS.prod) {
      errors.push(`${variant.bundleId} must use Firebase project ${FIREBASE_PROJECTS.prod} in a build (got ${project}). Dev builds use APP_VARIANT=dev.`);
    }
  }
  return errors;
}

// eas.json check, also run at build time. requireDevSubmit = a strict dev
// build, which must already know the dev App Store Connect app.
function checkEasJson(eas, { requireDevSubmit } = { requireDevSubmit: false }) {
  const errors = [];
  const build = (eas && eas.build) || {};
  const submit = (eas && eas.submit) || {};
  const devProfile = build[VARIANTS.dev.easBuildProfile];

  if (!devProfile) {
    errors.push(`eas.json has no "${VARIANTS.dev.easBuildProfile}" build profile.`);
  } else {
    if (devProfile.channel !== VARIANTS.dev.updatesChannel) {
      errors.push(`eas.json ${VARIANTS.dev.easBuildProfile} channel must be "${VARIANTS.dev.updatesChannel}".`);
    }
    if (!devProfile.env || devProfile.env.APP_VARIANT !== "dev") {
      errors.push(`eas.json ${VARIANTS.dev.easBuildProfile} must set env.APP_VARIANT to "dev".`);
    }
    if (!devProfile.env || devProfile.env.EXPO_PUBLIC_FIREBASE_ENV !== "dev") {
      errors.push(`eas.json ${VARIANTS.dev.easBuildProfile} must set env.EXPO_PUBLIC_FIREBASE_ENV to "dev".`);
    }
  }

  // No profile may mix the dev app with the production channel, or the
  // real app with the dev channel.
  for (const [name, profile] of Object.entries(build)) {
    const variant = profile && profile.env && profile.env.APP_VARIANT === "dev" ? "dev" : null;
    if (variant === "dev" && profile.channel === VARIANTS.prod.updatesChannel) {
      errors.push(`eas.json ${name}: the dev app can't use the "${VARIANTS.prod.updatesChannel}" channel.`);
    }
    if (variant !== "dev" && profile && profile.channel === VARIANTS.dev.updatesChannel) {
      errors.push(`eas.json ${name}: only the dev app may use the "${VARIANTS.dev.updatesChannel}" channel.`);
    }
  }

  const devSubmit = submit[VARIANTS.dev.easBuildProfile];
  const devAsc = devSubmit && devSubmit.ios && devSubmit.ios.ascAppId;
  if (!devAsc) {
    if (requireDevSubmit) {
      errors.push(`eas.json submit.${VARIANTS.dev.easBuildProfile}.ios.ascAppId is missing (the OrbitsWorks Dev App Store Connect app).`);
    }
  } else if (!/^\d+$/.test(String(devAsc))) {
    errors.push(`eas.json submit.${VARIANTS.dev.easBuildProfile}.ios.ascAppId must be the numeric Apple ID of the dev app.`);
  } else if (String(devAsc) === PROD_ASC_APP_ID) {
    errors.push(`eas.json submit.${VARIANTS.dev.easBuildProfile} points at the REAL App Store app (${PROD_ASC_APP_ID}).`);
  }
  return errors;
}

// Launch-time check. Inputs come from the native build (updates channel),
// the embedded config (variant, bundle id) and the Firebase project the JS
// would use. Returns { ok, reason }.
function evaluateRuntime({ channel, appVariant, bundleId, projectId }) {
  const isDevApp =
    channel === VARIANTS.dev.updatesChannel || appVariant === "dev" || bundleId === VARIANTS.dev.bundleId;
  if (isDevApp) {
    if (projectId !== FIREBASE_PROJECTS.dev) return { ok: false, reason: "devAppWrongProject" };
    if (channel === VARIANTS.prod.updatesChannel) return { ok: false, reason: "devAppOnProdChannel" };
    if (bundleId && bundleId !== VARIANTS.dev.bundleId) return { ok: false, reason: "devAppWrongBundle" };
    return { ok: true, reason: null };
  }
  // Real app installed from the store (production channel) must use prod.
  if (channel === VARIANTS.prod.updatesChannel && projectId !== FIREBASE_PROJECTS.prod) {
    return { ok: false, reason: "prodAppWrongProject" };
  }
  return { ok: true, reason: null };
}

module.exports = {
  FIREBASE_PROJECTS,
  PROD_ASC_APP_ID,
  VARIANTS,
  resolveFirebaseEnv,
  resolveVariant,
  checkBuildConfig,
  checkEasJson,
  evaluateRuntime,
};
