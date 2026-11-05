import { useEffect } from "react";
import { AppState } from "react-native";
import { registerEmployeePush } from "../employeePush";
import { onNotificationsGranted } from "../notificationPermission";
import { loadNotifications } from "../notificationsModule";
import { navigateToEmployeeAlerts } from "../navigationRef";

function isEmployeeNotification(response) {
  const data = response?.notification?.request?.content?.data;
  return !!(data && (data.employeeAlertId || data.breakReminder));
}

// Employee App Phase 7 (mounted in EmployeeTabs, so only for an employee
// login). Saves this phone's push token for the employee:
//   - on sign-in / app start, when notifications are already allowed
//   - right after the employee allows them (first clock-in ask, Settings)
//   - on every foreground (allowed in the phone's Settings meanwhile)
//   - when Expo hands the phone a new token
// Tapping an employee push or a break reminder opens the Alerts tab.
// Best-effort: none of this can block or slow a punch or a break.
export function useEmployeePush(employeeId) {
  useEffect(() => {
    if (!employeeId) return undefined;
    const register = (token) => {
      registerEmployeePush(employeeId, token || null);
    };
    register();
    const offGranted = onNotificationsGranted(() => register());
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") register();
    });
    const Notifications = loadNotifications();
    const tokenSub = Notifications ? Notifications.addPushTokenListener(() => register()) : null;
    return () => {
      offGranted();
      appState.remove();
      if (tokenSub) tokenSub.remove();
    };
  }, [employeeId]);

  useEffect(() => {
    const Notifications = loadNotifications();
    if (!Notifications) return undefined;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (isEmployeeNotification(response)) navigateToEmployeeAlerts();
      })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (isEmployeeNotification(response)) navigateToEmployeeAlerts();
    });
    return () => sub.remove();
  }, []);
}
