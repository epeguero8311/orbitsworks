import { Alert, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { permissionToggleAction } from "./employeeSettings";
import { isExpoGo, loadNotifications } from "./notificationsModule";

// Employee App notification permission. Phase 5: the Settings switch
// mirrors the phone's own permission (same shape as locationPermission.js).
// Phase 7: granting it (here or in the phone's Settings) is what lets the
// app register the employee's push token (lib/employeePush.js) and show
// break reminders. Denied or skipped never blocks a punch or a break.
// The employee's token is NOT the supervisor company pushTokens doc
// (firestore.rules still forbids that for employees).

// -> { status: "granted" | "denied" | "undetermined", canAskAgain }
export async function getNotificationPermissionStatus() {
  const Notifications = loadNotifications();
  if (isExpoGo || !Notifications) return { status: "denied", canAskAgain: false };
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    return { status, canAskAgain };
  } catch (err) {
    console.log("[notificationPermission] status check failed:", err.message);
    return { status: "undetermined", canAskAgain: true };
  }
}

// Called when permission is known to be granted (after a prompt here, or
// on a foreground check) - useEmployeePush registers the token then.
const grantedListeners = new Set();

export function onNotificationsGranted(listener) {
  grantedListeners.add(listener);
  return () => grantedListeners.delete(listener);
}

// A foreground check found it granted (e.g. turned on in the phone's
// Settings) - same signal as a granted prompt.
export function notifyNotificationsGranted() {
  for (const listener of grantedListeners) {
    try {
      listener();
    } catch {
      // a listener failing never affects the prompt
    }
  }
}

async function requestNotificationPermission() {
  const Notifications = loadNotifications();
  if (!Notifications) return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === "granted";
    if (granted) notifyNotificationsGranted();
    return granted;
  } catch (err) {
    console.log("[notificationPermission] request failed:", err.message);
    return false;
  }
}

function askWithExplanation(title, message) {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Not Now", style: "cancel", onPress: () => resolve(false) },
      { text: "Allow", onPress: () => requestNotificationPermission().then(resolve) },
    ]);
  });
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
  return askWithExplanation(
    "Allow notifications",
    "OrbitsWorks can show notifications on this phone. You can change this any time in your phone's Settings."
  );
}

// Phase 7 (F2 a): asked ONCE per install, after the employee's first
// clock-in green screen has closed - never in front of a punch. Only when
// the phone has never been asked; the Settings switch is the way back.
const ASKED_KEY = "employeeNotificationsAsked:v1";

export async function askNotificationsAfterFirstClockIn() {
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return false;
    const { status, canAskAgain } = await getNotificationPermissionStatus();
    await AsyncStorage.setItem(ASKED_KEY, "1");
    if (status !== "undetermined" || !canAskAgain) return status === "granted";
    return await askWithExplanation(
      "Get break and shift reminders",
      "OrbitsWorks can remind you when your break is almost over and when it's time to clock out, even when the app is closed."
    );
  } catch (err) {
    console.log("[notificationPermission] first clock-in ask failed:", err.message);
    return false;
  }
}
