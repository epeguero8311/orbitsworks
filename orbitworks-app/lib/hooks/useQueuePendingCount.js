import { useCallback, useEffect, useState } from "react";
import { subscribeQueueChange } from "../queueEvents";
import { getPendingCount } from "../queueSync";

// Drives the Sync Queue tab badge. Any read failure resolves to 0 rather
// than throwing, so a bad queue read can never take down the tab bar.
export function useQueuePendingCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    getPendingCount()
      .then(setCount)
      .catch(() => setCount(0));
  }, []);

  useEffect(() => {
    refresh();
    return subscribeQueueChange(refresh);
  }, [refresh]);

  return count;
}
