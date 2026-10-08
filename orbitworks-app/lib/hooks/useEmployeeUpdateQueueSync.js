import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../AuthContext";
import { drainEmployeeUpdateQueue, resetStuckEmployeeUpdateSyncs } from "../employeeUpdateQueueSync";

// Drains the Update Employee queue on the same triggers as
// useEmployeeQueueSync.js (login, app foreground, reconnect) - kept as its
// own hook/effect for the same reason that one is split from
// useQueueSync.js: independent table, independent failure/retry policy.
export function useEmployeeUpdateQueueSync() {
  const { userData, currentUser } = useAuth();
  const companyId = userData?.companyId;
  const didResetRef = useRef(false);

  const runDrain = () => {
    if (companyId) drainEmployeeUpdateQueue(companyId);
  };

  useEffect(() => {
    if (!currentUser || !companyId) return;

    if (!didResetRef.current) {
      didResetRef.current = true;
      resetStuckEmployeeUpdateSyncs().then(runDrain);
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
