import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { fixLocationPermission, getLocationPermissionStatus } from "../locationPermission";

const TEXT = "Location is off. Tap to turn it on so your punches show where they happened.";

// Employee App Phase 6: the Home banner while location permission is not
// given (skipped at sign-up, or denied later), on every plan. Re-checked
// on every foreground, so it goes away the moment the employee comes back
// from the phone's Settings with it on. Tap = fixLocationPermission (the
// phone's prompt if never asked, else the phone's Settings).
// -> { visible, text, fix }
export function useLocationBanner() {
  const [state, setState] = useState({ granted: true, loading: true });

  useEffect(() => {
    let active = true;
    const check = () =>
      getLocationPermissionStatus().then(({ status }) => {
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

  const fix = useCallback(async () => {
    const granted = await fixLocationPermission();
    if (granted) setState({ granted: true, loading: false });
  }, []);

  const visible = !state.loading && !state.granted;
  return { visible, text: visible ? TEXT : "", fix };
}
