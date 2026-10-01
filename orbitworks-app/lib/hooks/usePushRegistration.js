import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useAuth } from "../AuthContext";
import { registerForPushNotificationsAsync } from "../pushNotifications";
import { navigateToAlert } from "../navigationRef";

function extractAlertId(response) {
  return response?.notification?.request?.content?.data?.alertId ?? null;
}

// Registers this device for push on login/launch and wires tap-to-open:
// tapping a push (app backgrounded, foregrounded, or launched cold from
// the notification) opens the Alerts tab at that alert. All of this is
// best-effort - a failure anywhere here never blocks Home or crashes the
// app, since none of the clock-in flow depends on it.
export function usePushRegistration() {
  const { userData, currentUser } = useAuth();
  const companyId = userData?.companyId;

  useEffect(() => {
    if (!currentUser || !companyId) return;
    registerForPushNotificationsAsync(companyId);
  }, [currentUser, companyId]);

  useEffect(() => {
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
