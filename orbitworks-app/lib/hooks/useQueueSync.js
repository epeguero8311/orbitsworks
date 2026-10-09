import { useEffect } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../AuthContext";
import { drainQueue, resetStuckSyncs, isQueueSyncing, getPendingCount } from "../queueSync";

// Belt-and-suspenders poll interval. AppState/NetInfo triggers cover the
// common cases, but a phone that stays foregrounded on a flaky connection
// may never fire either event again once a drain has gone stuck. This is
// what actually recovers a queue sitting behind a bad network without
// requiring the user to background/foreground the app or toggle wifi.
const POLL_INTERVAL_MS = 60 * 1000;

// Drains the offline queue whenever there is a reasonable chance it can
// succeed: on login, on app foreground, on connectivity change, and on a
// 60s poll while anything is still queued. resetStuckSyncs runs before
// every one of those triggers (not just once per app launch) so a row
// left in 'syncing' by a prior stuck/killed drain self-heals on the very
// next opportunity, instead of waiting for a full app relaunch.
export function useQueueSync() {
  const { userData, currentUser } = useAuth();
  const companyId = userData?.companyId;

  useEffect(() => {
    if (!currentUser || !companyId) return;

    // Only safe to reset 'syncing' rows back to 'pending' when no drain
    // is currently in flight - otherwise this could yank a row out from
    // under a drain that is legitimately still working on it.
    const runDrain = async () => {
      if (!isQueueSyncing()) {
        await resetStuckSyncs();
      }
      drainQueue(companyId);
    };

    runDrain();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") runDrain();
    });

    const netInfoSub = NetInfo.addEventListener((state) => {
      if (state.isConnected) runDrain();
    });

    const interval = setInterval(async () => {
      if (isQueueSyncing()) return;
      const count = await getPendingCount();
      if (count > 0) runDrain();
    }, POLL_INTERVAL_MS);

    return () => {
      appStateSub.remove();
      netInfoSub();
      clearInterval(interval);
    };
  }, [currentUser, companyId]);
}
