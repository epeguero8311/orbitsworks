import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyDM0Zpi2XTiWjrqwwVQwQjPCbdu4QLYRUE",
  authDomain: "orbitworks-7ef59.firebaseapp.com",
  projectId: "orbitworks-7ef59",
  storageBucket: "orbitworks-7ef59.firebasestorage.app",
  messagingSenderId: "248478616055",
  appId: "1:248478616055:web:53a3de3a6b2632f61ac6f2",
  measurementId: "G-CLK9LYD7KT",
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
