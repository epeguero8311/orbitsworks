import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
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

// Analytics only works in the browser, and only if supported -
// calling getAnalytics() during server rendering will throw.
export const analyticsPromise = (async () => {
  if (typeof window === "undefined") return null;
  const supported = await isSupported();
  return supported ? getAnalytics(app) : null;
})();

export default app;
