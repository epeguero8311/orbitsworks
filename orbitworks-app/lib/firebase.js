import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// orbitworks-7ef59 - the real customer-facing project. Never point a
// dev/preview build at this on purpose; only a correctly configured
// production-environment bundle may use it (enforced below).
const PROD_CONFIG = {
  apiKey: "AIzaSyDM0Zpi2XTiWjrqwwVQwQjPCbdu4QLYRUE",
  authDomain: "orbitworks-7ef59.firebaseapp.com",
  projectId: "orbitworks-7ef59",
  storageBucket: "orbitworks-7ef59.firebasestorage.app",
  messagingSenderId: "248478616055",
  appId: "1:248478616055:web:53a3de3a6b2632f61ac6f2",
  measurementId: "G-CLK9LYD7KT",
};

// orbitworks-dev-ew - isolated Firebase project for development/testing
// (same Firestore rules and Cloud Functions deployed, no real customer
// data). This is what fault-injection testing and the Sync Queue dev
// panel are built to run against.
const DEV_CONFIG = {
  apiKey: "AIzaSyCmxM7S1kTHVwC6YJlQcDYebBayFhLX8jQ",
  authDomain: "orbitworks-dev-ew.firebaseapp.com",
  projectId: "orbitworks-dev-ew",
  storageBucket: "orbitworks-dev-ew.firebasestorage.app",
  messagingSenderId: "797101077485",
  appId: "1:797101077485:web:319119d9bf71be32336de4",
};

// Which project a build points at is controlled by EXPO_PUBLIC_FIREBASE_ENV.
// Unset/anything other than "prod" resolves to "dev" - the safe default,
// so a forgotten env var never silently points a test session at real
// customer data.
//
// IMPORTANT: this value must come from EAS-hosted environment variables
// (`eas env:set <environment> --name EXPO_PUBLIC_FIREBASE_ENV --value ...`),
// NOT from eas.json's per-profile "env" block. `eas build` auto-pulls
// EAS-hosted vars for the environment matching the build profile's name,
// but `eas update` does not read eas.json's "env" at all - it only gets
// these values if you pass `--environment <name>` (required on this
// project: Expo SDK 55+ makes `eas update` refuse to run without it,
// which is the real backstop against ever publishing with this unset).
// See the production checklist for why that still doesn't protect
// against `--branch production --environment preview` (a mismatched
// pairing) - that has to be enforced at publish time, not here.
const requestedEnv = process.env.EXPO_PUBLIC_FIREBASE_ENV === "prod" ? "prod" : "dev";

// Which of the three EAS environments (development/preview/production)
// produced this bundle. Deliberately NOT __DEV__: an EAS "preview" build
// is a release-mode JS bundle (__DEV__ === false) that must still be
// allowed to point at dev, so __DEV__ cannot distinguish "preview" from
// "production" - only this explicit, deliberately-set variable can. Also
// set via `eas env:set`, never eas.json.
const buildProfile = process.env.EXPO_PUBLIC_BUILD_PROFILE;

// A release-mode bundle (__DEV__ === false) with NO build profile set at
// all means the EAS environment variables never made it into this build
// - eas build didn't pull them for some reason, or the release bundle
// was produced some other way. Without this check that case fell through
// to the same "unset -> dev" default as a normal dev client, so a
// misconfigured production build would boot fine against the DEV
// project instead of failing loudly. A dev client build (__DEV__ true)
// is exempt and keeps defaulting to dev - that's the ordinary
// "ran it locally, nothing configured" case for a developer.
if (!__DEV__ && !buildProfile) {
  throw new Error(
    "firebase.js: release build with no EXPO_PUBLIC_BUILD_PROFILE set. " +
      "EAS environment variables did not reach this bundle - refusing to " +
      "boot rather than silently defaulting to the dev Firebase project. " +
      "Check which EAS environment this build/update actually used " +
      "(eas env:list <environment>)."
  );
}

// Only the production environment is held to "must resolve to prod."
// This catches a production build/update that ran with a build profile
// set but FIREBASE_ENV missing or wrong (the other realistic
// "half-configured" failure). It cannot catch a publish command that
// mismatches branch and environment on purpose or by typo (e.g.
// `--branch production --environment preview`) - nothing inside the
// bundle can know which channel it was actually published to, so that
// pairing is a publish-time discipline, not a runtime check. See the
// production checklist.
if (buildProfile === "production" && requestedEnv !== "prod") {
  throw new Error(
    "firebase.js: build profile is 'production' but FIREBASE_ENV resolved to '" +
      requestedEnv +
      "'. Check this EAS environment's variables (eas env:list production)."
  );
}

export const FIREBASE_ENV = requestedEnv;
const firebaseConfig = requestedEnv === "prod" ? PROD_CONFIG : DEV_CONFIG;

// Exposed for the dev panel (lib/syncFaults.js consumers) so "which
// project is this build pointed at" is something you can read on screen
// instead of inferring from the build profile. Safe to export in any
// build - only ever rendered behind __DEV__.
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

// Printed on every boot, not gated on __DEV__, specifically so this is
// checkable even on a build/branch that has no dev panel at all (e.g.
// the test/old-queue-bug branch used to reproduce the original bug) -
// "confirm the project before touching anything" only works if there is
// always somewhere to look.
console.log(`[firebase] env=${FIREBASE_ENV} project=${firebaseConfig.projectId} buildProfile=${buildProfile ?? "(unset)"}`);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
if (Platform.OS === "web") {
  auth = getAuth(app);
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export { auth, db, storage, functions };
export default app;
