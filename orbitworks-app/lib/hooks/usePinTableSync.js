import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../AuthContext";
import { syncPinTable } from "../pinSync";

const PERIODIC_INTERVAL_MS = 20 * 60 * 1000;

// Keeps the local PIN cache fresh: syncs on login, whenever the app is
// foregrounded, whenever connectivity is regained, and on a 20-minute
// timer as a safety net for long foreground sessions. Silently no-ops
// when offline - the next trigger picks it back up once there is signal.
export function usePinTableSync() {
  const { userData, currentUser } = useAuth();
  const companyId = userData?.companyId;
  const syncingRef = useRef(false);

  const runSync = async () => {
    if (!companyId || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;
      await syncPinTable();
    } catch (err) {
      console.log("PIN table sync failed:", err.message);
    } finally {
      syncingRef.current = false;
    }
  };

  useEffect(() => {
    if (!currentUser || !companyId) return;

    runSync();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") runSync();
    });

    const netInfoSub = NetInfo.addEventListener((state) => {
      if (state.isConnected) runSync();
    });

    const interval = setInterval(runSync, PERIODIC_INTERVAL_MS);

    return () => {
      appStateSub.remove();
      netInfoSub();
      clearInterval(interval);
    };
  }, [currentUser, companyId]);
}