import { useCallback, useEffect, useState } from "react";
import { getUnreadEmployeeSyncAlertCount, subscribeEmployeeSyncAlertChange } from "../employeeSyncAlerts";

// Same shape as useDeclinedCount.js, driving a separate badge for Create
// Employee sync issues (see db.js's employee_sync_alerts comment for why
// this is a distinct table/badge rather than folding into that one).
export function useEmployeeSyncAlertCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    getUnreadEmployeeSyncAlertCount().then(setCount);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeEmployeeSyncAlertChange(refresh);
    return unsubscribe;
  }, [refresh]);

  return count;
}
