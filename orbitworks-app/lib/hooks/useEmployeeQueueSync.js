import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../AuthContext";
import { drainEmployeeQueue, resetStuckEmployeeSyncs } from "../employeeQueueSync";

// Drains the Create Employee queue on the same triggers as useQueueSync.js
// (login, app foreground, reconnect) - kept as its own hook/effect rather
// than folded into that one since the two queues are independent tables
// with independent failure/retry policies.
export function useEmployeeQueueSync() {
  const { userData, currentUser } = useAuth();
  const companyId = userData?.companyId;
  const didResetRef = useRef(false);

  const runDrain = () => {
    if (companyId) drainEmployeeQueue(companyId);
  };

  useEffect(() => {
    if (!currentUser || !companyId) return;

    if (!didResetRef.current) {
      didResetRef.current = true;
      resetStuckEmployeeSyncs().then(runDrain);
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
