import { Platform } from "react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import { FIREBASE_PROJECTS, evaluateRuntime, resolveFirebaseEnv } from "../config/envRules";

// Launch-time environment check. Must NOT import lib/firebase.js - it runs
// before Firebase is touched (see index.js). Rules live in config/envRules.js.
//
// Inputs:
// - Updates.channel: baked into the native build by EAS, an OTA update
//   can't change it.
// - expoConfig extra.appVariant / bundle id: from app.config.js.
// - projectId: the Firebase project lib/firebase.js would pick.
export function getEnvironmentVerdict() {
  const config = Constants.expoConfig ?? {};
  const bundleId = Platform.OS === "ios" ? config.ios?.bundleIdentifier : config.android?.package;
  return evaluateRuntime({
    channel: Updates.channel ?? null,
    appVariant: config.extra?.appVariant ?? null,
    bundleId: bundleId ?? null,
    projectId: FIREBASE_PROJECTS[resolveFirebaseEnv(process.env.EXPO_PUBLIC_FIREBASE_ENV)],
  });
}
