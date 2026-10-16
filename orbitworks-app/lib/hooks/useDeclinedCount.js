import { useCallback, useEffect, useState } from "react";
import { getUnreadDeclinedCount } from "../declinedClockIns";
import { subscribeDeclinedChange } from "../declinedEvents";

// Drives the Dashboard bell's unread badge - same subscribe-on-mount shape
// as useLocalEmployee.js. Dashboard never freezes on blur (see App.js), so
// this stays live even while another screen is on top.
export function useDeclinedCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    getUnreadDeclinedCount().then(setCount);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeDeclinedChange(refresh);
    return unsubscribe;
  }, [refresh]);

  return count;
}
