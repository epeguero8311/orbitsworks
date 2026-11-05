import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { fixLocationPermission, getAlwaysLocationStatus, requestLocationPermissionForToggle } from "../locationPermission";

// Settings' Location toggle. Unlike Notifications (pushNotifications.js's
// getNotificationState/setNotificationsEnabled), there is no separate
// per-company preference to store - the OS permission itself IS the
// state, so this just mirrors it. Re-checks on every foreground
// (AppState "active"), so flipping the permission in the phone's own
// Settings app is picked up the moment the user comes back.
// Phase 8: access = "always" | "whileUsing" | "off" (Settings shows it).
// State is set only in promise callbacks (no setState in the effect body).
export function useLocationPermission() {
  const [state, setState] = useState({ access: "off", loading: true });

  const check = useCallback(
    () =>
      getAlwaysLocationStatus().then((access) => {
        setState({ access, loading: false });
        return access;
      }),
    []
  );

  useEffect(() => {
    let active = true;
    const run = () =>
      getAlwaysLocationStatus().then((access) => {
        if (active) setState({ access, loading: false });
      });
    run();
    const sub = AppState.addEventListener("change", (appState) => {
      if (appState === "active") run();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const requestPermission = useCallback(async () => {
    const result = await requestLocationPermissionForToggle();
    await check();
    return result;
  }, [check]);

  // Employee App (Phase 6): the phone's prompt if never asked, else the
  // phone's Settings (lib/locationPermission.js fixLocationPermission).
  const fixPermission = useCallback(async () => {
    const result = await fixLocationPermission();
    await check();
    return result;
  }, [check]);

  return { granted: state.access !== "off", access: state.access, loading: state.loading, requestPermission, fixPermission };
}
