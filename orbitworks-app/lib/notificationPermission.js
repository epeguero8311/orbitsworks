import { Alert, Linking } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { permissionToggleAction } from "./employeeSettings";

// Employee App Phase 5 (decided 2026-11-03, Settings 18): the Settings
// Notifications switch mirrors the phone's own notification permission
// only. Nothing is registered and nothing is sent - employees get no push
// token (firestore.rules forbids one). Same shape as locationPermission.js.
//
// expo-notifications is required lazily and never in Expo Go, for the
// reason in pushNotifications.js (importing it runs a push auto-register
// side effect that throws on Android under Expo Go).
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function loadNotifications() {
  return require("expo-notifications");
}

// -> { status: "granted" | "denied" | "undetermined", canAskAgain }
export async function getNotificationPermissionStatus() {
  if (isExpoGo) return { status: "denied", canAskAgain: false };
  try {
    const { status, canAskAgain } = await loadNotifications().getPermissionsAsync();
    return { status, canAskAgain };
  } catch (err) {
    console.log("[notificationPermission] status check failed:", err.message);
    return { status: "undetermined", canAskAgain: true };
  }
}

async function requestNotificationPermission() {
  try {
    const { status } = await loadNotifications().requestPermissionsAsync();
    return status === "granted";
  } catch (err) {
    console.log("[notificationPermission] request failed:", err.message);
    return false;
  }
}

// The switch was tapped. Resolves to whether notifications are allowed now
// (the hook re-checks on the next foreground anyway, so a trip to the
// phone's Settings app is picked up when the employee comes back).
export async function setNotificationsFromToggle(wantOn) {
  const permission = await getNotificationPermissionStatus();
  const action = permissionToggleAction(wantOn, permission);
  if (action === "openSettings") {
    Linking.openSettings();
    return permission.status === "granted";
  }
  if (action !== "ask") return permission.status === "granted";
  return new Promise((resolve) => {
    Alert.alert("Allow notifications", "OrbitsWorks can show notifications on this phone. You can change this any time in your phone's Settings.", [
      { text: "Not Now", style: "cancel", onPress: () => resolve(false) },
      { text: "Allow", onPress: () => requestNotificationPermission().then(resolve) },
    ]);
  });
}
