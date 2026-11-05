import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

// The one place the app loads expo-notifications (supervisor push, the
// employee Settings switch, Employee App Phase 7 push + break reminders).
//
// expo-notifications must never be imported at module scope. Importing the
// package at all (not just calling a push API) runs an internal
// auto-registration side effect that calls addPushTokenListener as soon as
// the module is evaluated, and that throws on Android under Expo Go (push
// was removed there in SDK 53). require() it lazily, and only after
// confirming we are not in Expo Go - same reason lib/location.js and
// lib/locationPermission.js require() expo-location lazily instead of
// importing it.
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// null in Expo Go, or if the native module can't load.
export function loadNotifications() {
  if (isExpoGo) return null;
  try {
    return require("expo-notifications");
  } catch (e) {
    console.log("[notifications] load failed:", e.message);
    return null;
  }
}

let handlerConfigured = false;

// Foreground display behavior - show + sound while the app is open, no
// badge (nothing on this app's icon reads a badge count today).
export function ensureNotificationHandler(Notifications) {
  if (handlerConfigured || !Notifications) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Android 8+: every notification needs a channel (Phase 7: the default one
// for server pushes and break reminders). No-op on iOS. Never throws.
export const NOTIFICATION_CHANNEL_ID = "default";
let channelReady = null;

export function ensureAndroidChannel(Notifications) {
  if (Platform.OS !== "android" || !Notifications) return Promise.resolve();
  if (!channelReady) {
    channelReady = Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: "Alerts",
      importance: Notifications.AndroidImportance.HIGH,
    }).catch((e) => {
      channelReady = null;
      console.log("[notifications] channel setup failed:", e.message);
    });
  }
  return channelReady;
}
