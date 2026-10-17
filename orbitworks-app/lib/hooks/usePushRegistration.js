import { useEffect } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useAuth } from "../AuthContext";
import { registerForPushNotificationsAsync } from "../pushNotifications";
import { navigateToAlert } from "../navigationRef";

// Same reason as lib/pushNotifications.js: expo-notifications must never
// be imported at module scope, since merely importing it (not just calling
// a push API) runs an internal side effect that throws on Android under
// Expo Go. require() it lazily inside the effect below, only after
// confirming we are not in Expo Go.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function loadNotifications() {
  return require("expo-notifications");
}

function extractAlertId(response) {
  return response?.notification?.request?.content?.data?.alertId ?? null;
}

// Registers this device for push on login/launch and wires tap-to-open:
// tapping a push (app backgrounded, foregrounded, or launched cold from
// the notification) opens the Alerts tab at that alert. All of this is
// best-effort - a failure anywhere here never blocks Home or crashes the
// app, since none of the clock-in flow depends on it. Entirely skipped in
// Expo Go, where push was removed on Android in SDK 53.
export function usePushRegistration() {
  const { userData, currentUser } = useAuth();
  const companyId = userData?.companyId;

  useEffect(() => {
    if (!currentUser || !companyId) return;
    registerForPushNotificationsAsync(companyId);
  }, [currentUser, companyId]);

  useEffect(() => {
    if (isExpoGo) {
      console.warn(
        "[usePushRegistration] skipped: push notifications are not supported in Expo Go, use a development build instead"
      );
      return;
    }

    const Notifications = loadNotifications();

    // App launched fresh by tapping a notification (cold start).
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const alertId = extractAlertId(response);
        if (alertId) navigateToAlert(alertId);
      })
      .catch(() => {});

    // App was already running (foreground or backgrounded) when tapped.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const alertId = extractAlertId(response);
      if (alertId) navigateToAlert(alertId);
    });

    return () => subscription.remove();
  }, []);
}
