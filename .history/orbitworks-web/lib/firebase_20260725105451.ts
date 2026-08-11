import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { isSupported, getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDM0Zpi2XTiWjrqwwVQwQjPCbdu4QLYRUE",
  authDomain: "orbitworks-7ef59.firebaseapp.com",
  projectId: "orbitworks-7ef59",
  storageBucket: "orbitworks-7ef59.firebasestorage.app",
  messagingSenderId: "248478616055",
  appId: "1:248478616055:web:53a3de3a6b2632f61ac6f2",
  measurementId: "G-CLK9LYD7KT",
};

// Prevent re-initializing the app on hot reloads
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Analytics only works in the browser, and only if supported —
// calling getAnalytics() during server rendering will throw.
export const analyticsPromise = (async () => {
  if (typeof window === "undefined") return null;
  const supported = await isSupported();
  return supported ? getAnalytics(app) : null;
})();

export default app;