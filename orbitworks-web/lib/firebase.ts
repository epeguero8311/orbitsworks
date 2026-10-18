import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { isSupported, getAnalytics } from "firebase/analytics";

// Env-gated so this can never silently fall back to the production
// project - a missing var throws at startup instead. Lookups use static
// `process.env.NEXT_PUBLIC_*` member expressions (not a dynamic key) on
// purpose: same reasoning as lib/stripe/tiers.ts's requirePriceId -
// Next.js only inlines NEXT_PUBLIC_ vars into the client bundle when it
// can statically see the literal name. See .env.example for the full
// list and where to get real values for a given project.
function requireFirebaseEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env.local for local dev, and in Vercel's project env vars for every deployed environment - see .env.example. There is no fallback to a default Firebase project.`
    );
  }
  return value;
}

const firebaseConfig = {
  apiKey: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: requireFirebaseEnv(
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  ),
  appId: requireFirebaseEnv("NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  // Optional, unlike every field above - omitting it just means GA4
  // events aren't tied to an explicit measurement id, never a reason to
  // throw at startup.
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Prevent re-initializing the app on hot reloads
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Opt-in only, never on by default - lets callable functions be tested
// against a project's REAL Firestore/Storage/Auth data (e.g. prod)
// without deploying anything there: run
// `firebase emulators:start --only functions --project <alias>` (no
// firestore/storage/auth emulator alongside it), set this var in
// .env.local, and every httpsCallable from this client routes to that
// local emulator instead of whatever's actually deployed, while reads/
// writes made directly from the client (db/storage/auth above) still hit
// the real project untouched. globalThis guard is only to survive Next.js
// Fast Refresh re-running this module - connectFunctionsEmulator throws
// if called more than once on the same functions instance.
declare global {
  var __functionsEmulatorConnected: boolean | undefined;
}
if (process.env.NEXT_PUBLIC_USE_FUNCTIONS_EMULATOR === "true" && !globalThis.__functionsEmulatorConnected) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5091);
  globalThis.__functionsEmulatorConnected = true;
}

// Analytics only works in the browser, and only if supported -
// calling getAnalytics() during server rendering will throw.
export const analyticsPromise = (async () => {
  if (typeof window === "undefined") return null;
  const supported = await isSupported();
  return supported ? getAnalytics(app) : null;
})();

export default app;
