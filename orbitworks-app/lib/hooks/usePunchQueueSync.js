import { useEffect } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { cleanupPunchQueue } from "../punchQueue";
import { subscribeSyncKick } from "../punchQueueEvents";
import { isPunchSyncRunning, syncPunchQueue } from "../punchQueueSync";

const RETRY_EVERY_MS = 30000;

// Employee App Phase 4: keeps sending the signed-in employee's saved
// punches. Mounted once with the employee tabs (App.js). Sends:
//   - at start (after putting a punch left "Syncing" by a killed app back
//     to Waiting, and deleting PINs older than 24 h)
//   - when a punch is saved or redone
//   - when the connection comes back, or the app comes to the front
//   - every 30 s while signed in (cheap when nothing is waiting)
// Only this employee's punches are sent (lib/punchQueueSync.js).
export function usePunchQueueSync(companyId, employeeId) {
  useEffect(() => {
    if (!companyId || !employeeId) return undefined;
    const sync = () => {
      // Only with the app in front (the PIN keychain is locked otherwise).
      if (AppState.currentState !== "active") return;
      syncPunchQueue(companyId, employeeId).catch(() => {});
    };

    if (!isPunchSyncRunning()) {
      cleanupPunchQueue({ resetSyncing: true })
        .catch(() => {})
        .finally(sync);
    } else {
      sync();
    }

    let wasOffline = false;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      if (wasOffline && !offline) sync();
      wasOffline = offline;
    });
    const appSub = AppState.addEventListener("change", (s) => {
      if (s === "active") sync();
    });
    const unsubscribeKick = subscribeSyncKick(sync);
    const timer = setInterval(sync, RETRY_EVERY_MS);

    return () => {
      unsubscribeNet();
      appSub.remove();
      unsubscribeKick();
      clearInterval(timer);
    };
  }, [companyId, employeeId]);
}
