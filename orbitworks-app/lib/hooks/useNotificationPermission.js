import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { getNotificationPermissionStatus, setNotificationsFromToggle } from "../notificationPermission";

// Employee App Settings' Notifications switch (Phase 5). The phone's own
// permission IS the state - same idea as useLocationPermission: re-checked
// on every foreground, so a change in the phone's Settings app shows the
// moment the employee comes back.
// -> { granted, loading, setEnabled(wantOn) }
export function useNotificationPermission() {
  const [state, setState] = useState({ granted: false, loading: true });

  useEffect(() => {
    let active = true;
    const check = () =>
      getNotificationPermissionStatus().then(({ status }) => {
        if (active) setState({ granted: status === "granted", loading: false });
      });
    check();
    const sub = AppState.addEventListener("change", (appState) => {
      if (appState === "active") check();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const setEnabled = useCallback(async (wantOn) => {
    const granted = await setNotificationsFromToggle(wantOn);
    setState({ granted, loading: false });
    return granted;
  }, []);

  return { granted: state.granted, loading: state.loading, setEnabled };
}
