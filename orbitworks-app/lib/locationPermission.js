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
