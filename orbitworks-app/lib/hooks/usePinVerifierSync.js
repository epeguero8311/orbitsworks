import { useEffect } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { refreshPinVerifier } from "../pinCheck";

// Employee App: keeps this employee's PIN check value (lib/pinCheck.js)
// fresh, so a PIN changed on the website reaches the phone as soon as it
// is online. Mounted once with the employee tabs (App.js). Refreshes at
// start, when the app comes to the front and when the connection comes
// back. Offline it does nothing; the phone keeps the last one it had.
export function usePinVerifierSync(companyId, employeeId) {
  useEffect(() => {
    if (!companyId || !employeeId) return undefined;
    const refresh = () => {
      if (AppState.currentState !== "active") return;
      refreshPinVerifier(companyId, employeeId).catch(() => {});
    };
    refresh();
    let wasOffline = false;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      if (wasOffline && !offline) refresh();
      wasOffline = offline;
    });
    const appSub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => {
      unsubscribeNet();
      appSub.remove();
    };
  }, [companyId, employeeId]);
}
