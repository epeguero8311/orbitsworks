import { Platform } from "react-native";
import Constants from "expo-constants";

// Task 6: this build's version + platform (sent with supervisor / kiosk
// punches and the on-open report; compared with appConfig/versions).
export const APP_VERSION = Constants.expoConfig?.version ?? null;
export const APP_PLATFORM = Platform.OS === "android" ? "android" : "ios";
export const APP_VARIANT = Constants.expoConfig?.extra?.appVariant ?? null;
export const ANDROID_PACKAGE = Constants.expoConfig?.android?.package ?? null;

// The fields a punch carries ({} when the version is unknown - e.g. Expo Go).
export function appVersionFields() {
  return APP_VERSION && /^\d{1,4}(\.\d{1,4}){0,3}$/.test(APP_VERSION)
    ? { appVersion: APP_VERSION, appPlatform: APP_PLATFORM }
    : {};
}
