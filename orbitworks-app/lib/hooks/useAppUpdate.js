import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { APP_PLATFORM, APP_VARIANT, APP_VERSION, ANDROID_PACKAGE } from "../appVersionInfo";
import { dismissValue, storeUrl, updateState } from "../appVersion";

// Task 6 (update banner): live appConfig/versions (signed-in read) -> what
// to show (lib/appVersion.js). Nothing until the doc exists. All 3 modes.
const DISMISS_KEY = "updateBannerDismissed";
const HOUR_MS = 60 * 60 * 1000;

export function useAppUpdate(signedIn) {
  const [config, setConfig] = useState(null);
  const [dismissed, setDismissed] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!signedIn) return undefined;
    return onSnapshot(
      doc(db, "appConfig", "versions"),
      (snap) => setConfig(snap.exists() ? snap.data() : null),
      () => setConfig(null)
    );
  }, [signedIn]);

  useEffect(() => {
    AsyncStorage.getItem(DISMISS_KEY).then(setDismissed).catch(() => {});
  }, []);

  // "Comes back the next day": re-checked on returning to the app and hourly.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), HOUR_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setNowMs(Date.now());
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, []);

  const state = signedIn
    ? updateState({ current: APP_VERSION, platform: APP_PLATFORM, doc: config, dismissed, nowMs })
    : { kind: "none", latest: null, current: APP_VERSION };

  const latest = state.latest;
  const dismiss = useCallback(() => {
    if (!latest) return;
    const value = dismissValue(latest, Date.now());
    setDismissed(value);
    AsyncStorage.setItem(DISMISS_KEY, value).catch(() => {});
  }, [latest]);

  const openStore = useCallback(() => {
    Linking.openURL(storeUrl(APP_PLATFORM, { variant: APP_VARIANT, androidPackage: ANDROID_PACKAGE })).catch(() => {});
  }, []);

  return { ...state, dismiss, openStore };
}
