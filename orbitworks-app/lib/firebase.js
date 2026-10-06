import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// Env-gated so this can never silently fall back to the production
// project - a missing var throws at startup instead. Lookups use static
// `process.env.EXPO_PUBLIC_*` member expressions (not a dynamic key) on
// purpose: Metro/EAS only inline EXPO_PUBLIC_ vars into the bundle when
// it can statically see the literal name at build time, same reasoning
// as Next.js's NEXT_PUBLIC_ vars (see orbitworks-web/lib/firebase.ts).
// See .env.example for local dev and eas.json's per-profile `env` for
// EAS builds.
function requireFirebaseEnv(name, value) {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env.local for local dev, and in this build's eas.json profile for any EAS build - see .env.example. There is no fallback to a default Firebase project.`
    );
  }
  return value;
}

const firebaseConfig = {
  apiKey: requireFirebaseEnv("EXPO_PUBLIC_FIREBASE_API_KEY", process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: requireFirebaseEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: requireFirebaseEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: requireFirebaseEnv(
    "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
  ),
  messagingSenderId: requireFirebaseEnv(
    "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  ),
  appId: requireFirebaseEnv("EXPO_PUBLIC_FIREBASE_APP_ID", process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
  // Optional, unlike every field above - never a reason to throw at
  // startup over this one.
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

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
