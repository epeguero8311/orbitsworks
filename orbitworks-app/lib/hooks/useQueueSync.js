import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../AuthContext";
import { drainQueue, resetStuckSyncs } from "../queueSync";

// Drains the offline queue whenever there is a reasonable chance it can
// succeed: on login, on app foreground, and whenever connectivity comes
// back. resetStuckSyncs runs once on mount to recover from an app kill
// that happened mid-upload in a prior session.
export function useQueueSync() {
  const { userData, currentUser } = useAuth();
  const companyId = userData?.companyId;
  const didResetRef = useRef(false);

  const runDrain = () => {
    if (companyId) drainQueue(companyId);
  };

  useEffect(() => {
    if (!currentUser || !companyId) return;

    if (!didResetRef.current) {
      didResetRef.current = true;
      resetStuckSyncs().then(runDrain);
    } else {
      runDrain();
    }

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") runDrain();
    });

    const netInfoSub = NetInfo.addEventListener((state) => {
      if (state.isConnected) runDrain();
    });

    return () => {
      appStateSub.remove();
      netInfoSub();
    };
  }, [currentUser, companyId]);
}