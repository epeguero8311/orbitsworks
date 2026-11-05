import { Alert, Linking } from "react-native";

// Lazily required, same reason as lib/location.js's own lazy require:
// expo-location's native binding calls requireNativeModule() at import
// time, which throws synchronously if the installed binary doesn't have
// the module linked in. Deferring it here means that failure can only
// ever disable location features, never break module evaluation itself.
function loadLocation() {
  return require("expo-location");
}

// Single source of truth for foreground location permission status -
// both the Settings toggle (useLocationPermission) and clock-in's
// best-effort fix (lib/location.js) read through this, so they can never
// disagree about what granted/denied/undetermined means or how
// canAskAgain is interpreted.
export async function getLocationPermissionStatus() {
  try {
    const Location = loadLocation();
    return await Location.getForegroundPermissionsAsync();
  } catch (err) {
    console.log("[locationPermission] status check failed:", err.message);
    return { status: "undetermined", canAskAgain: true };
  }
}

// Raw request - no UI, just the native prompt (or an instant resolve if
// the OS has already decided and won't ask again). Used by clock-in,
// which must never show a dialog of its own (see lib/location.js's
// never-block-a-clock-in comment), and internally by
// requestLocationPermissionForToggle below once it has already decided
// an Alert is warranted.
export async function requestLocationPermission() {
  try {
    const Location = loadLocation();
    return await Location.requestForegroundPermissionsAsync();
  } catch (err) {
    console.log("[locationPermission] request failed:", err.message);
    return { status: "denied", canAskAgain: false };
  }
}

// Settings toggle flow - same shape as pushNotifications.js's
// ensureNotificationPermission: shows the "why we're asking" explanation
// only when the system permission is still undetermined, never nags an
// already-granted or already-denied user again. Denying changes nothing;
// this just resolves false. When the OS has already decided it won't
// show its own prompt again (denied + canAskAgain false), there is no
// in-app dialog that can do anything - the only path left is the OS
// Settings app, so this opens it directly instead of showing a dead-end
// Alert.
export async function requestLocationPermissionForToggle() {
  const { status, canAskAgain } = await getLocationPermissionStatus();
  if (status === "granted") return true;

  if (status !== "undetermined" || !canAskAgain) {
    if (status === "denied" && !canAskAgain) Linking.openSettings();
    return false;
  }

  return new Promise((resolve) => {
    Alert.alert(
      "Share your location",
      "OrbitsWorks can use your location to confirm where clock-ins and clock-outs happen - only while you're using the app.",
      [
        { text: "Not Now", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Enable",
          onPress: async () => {
            const { status: newStatus } = await requestLocationPermission();
            resolve(newStatus === "granted");
          },
        },
      ]
    );
  });
}

// Employee App Phase 6 - the Home location banner and the Settings
// Location switch. Never been asked (sign-up step skipped): the phone's own
// "While using the app" prompt. Denied before (iPhone or Android): the
// phone's Settings app, the only place it can be turned on. -> true when
// granted now (from Settings, the foreground re-check picks it up later).
export async function fixLocationPermission() {
  const { status, canAskAgain } = await getLocationPermissionStatus();
  if (status === "granted") return true;
  if (status === "undetermined" && canAskAgain) {
    const { status: next } = await requestLocationPermission();
    return next === "granted";
  }
  Linking.openSettings();
  return false;
}

// ---- Employee App Phase 8: "Always" location (leave tracking, Pro) ----
//
// -> "always" | "whileUsing" | "off". Never throws. Settings shows it, and
// leave tracking only runs on "always" (a region needs background location).
export async function getAlwaysLocationStatus() {
  try {
    const Location = loadLocation();
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== "granted") return "off";
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.status === "granted" ? "always" : "whileUsing";
  } catch (err) {
    console.log("[locationPermission] always status failed:", err.message);
    return "off";
  }
}

// The phone's own prompts: "While using" first if never asked, then the
// upgrade to "Always". On iPhone the upgrade prompt shows once at most;
// after that only the phone's Settings can change it (the walk-through
// screen says how). -> { status, canAskAgain } of the background step.
// Never throws, never shows a dialog of its own.
export async function requestAlwaysLocation() {
  try {
    const Location = loadLocation();
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      if (!fg.canAskAgain) return { status: "denied", canAskAgain: false };
      const asked = await Location.requestForegroundPermissionsAsync();
      if (asked.status !== "granted") return { status: "denied", canAskAgain: false };
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    return { status: bg.status, canAskAgain: bg.canAskAgain !== false };
  } catch (err) {
    console.log("[locationPermission] always request failed:", err.message);
    return { status: "denied", canAskAgain: false };
  }
}

// The phone's Settings app (the only way to Always once the prompt is used up).
export function openLocationSettings() {
  Linking.openSettings();
}
