import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { getLocationPermissionStatus, requestLocationPermissionForToggle } from "../locationPermission";

// Settings' Location toggle. Unlike Notifications (pushNotifications.js's
// getNotificationState/setNotificationsEnabled), there is no separate
// per-company preference to store - the OS permission itself IS the
// state, so this just mirrors it. Re-checks on every foreground
// (AppState "active"), same pattern as useQueueSync.js, so flipping the
// permission in the phone's own Settings app is picked up the moment the
// user comes back without needing to relaunch.
export function useLocationPermission() {
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { status } = await getLocationPermissionStatus();
    setGranted(status === "granted");
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const requestPermission = useCallback(async () => {
    const result = await requestLocationPermissionForToggle();
    setGranted(result);
    return result;
  }, []);

  return { granted, loading, requestPermission };
}
