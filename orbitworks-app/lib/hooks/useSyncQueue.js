import { useCallback, useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../AuthContext";
import { getDb } from "../db";
import { subscribeQueueChange } from "../queueEvents";
import { drainQueue, isQueueSyncing, retryQueueItem } from "../queueSync";

// How long a 'synced' row stays visible in the Sync Queue list after it
// finishes, purely for display - separate from queueSync.js's own
// SYNCED_RETENTION_MS, which keeps the row in SQLite for an hour for
// other consumers (useLocalStatusOverlay) and must not change.
const SYNCED_DISPLAY_MS = 3000;

// Read-only view of event_queue for the Sync Queue tab. Refreshes off the
// same notifyQueueChange pub/sub the offline overlay already uses, plus
// connectivity changes - never polls, and never writes to the table
// itself (retry() is the one deliberate exception - a human-initiated
// un-dead-letter, not an automatic mutation), so viewing this screen
// can't silently mutate, reorder, or drop anything queued.
export function useSyncQueue() {
  const { userData } = useAuth();
  const companyId = userData?.companyId;
  const [rows, setRows] = useState([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const sqlite = await getDb();
      const result = await sqlite.getAllAsync(
        "SELECT * FROM event_queue ORDER BY clientTimestamp DESC"
      );
      setRows(result ?? []);
    } catch (e) {
      // A read failure here should empty the list, not crash the tab.
      setRows([]);
    }
    setSyncing(isQueueSyncing());
    setNow(Date.now());
  }, []);

  useEffect(() => {
    refresh();

    const unsubscribeQueue = subscribeQueueChange(refresh);
    const netSub = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    NetInfo.fetch().then((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });

    return () => {
      unsubscribeQueue();
      netSub();
    };
  }, [refresh]);

  // Self-terminating tick: only runs while a 'synced' row is still inside
  // its brief display window, so those rows fade out of the list on
  // their own without a global polling loop.
  useEffect(() => {
    const hasRecentlySynced = rows.some(
      (r) => r.syncStatus === "synced" && r.syncedAt && now - r.syncedAt < SYNCED_DISPLAY_MS
    );
    if (!hasRecentlySynced) return;
    const timer = setTimeout(() => setNow(Date.now()), 250);
    return () => clearTimeout(timer);
  }, [rows, now]);

  const items = rows.filter(
    (r) => !(r.syncStatus === "synced" && r.syncedAt && now - r.syncedAt >= SYNCED_DISPLAY_MS)
  );

  // Same flush drainQueue/auto-sync already uses - drainQueue's own
  // `syncing` guard makes this a no-op if a drain is already running, so
  // this never opens a second concurrent flush.
  const syncNow = useCallback(() => {
    if (companyId) drainQueue(companyId);
  }, [companyId]);

  // Un-dead-letters a single row: resets attempts/lastError and puts it
  // back to 'pending' so the next drain (triggered right after) will
  // pick it up again. Dead rows are otherwise permanently excluded from
  // drainQueue's own SELECT, so without this they would sit forever.
  const retry = useCallback(
    async (localId) => {
      await retryQueueItem(localId);
      if (companyId) drainQueue(companyId);
    },
    [companyId]
  );

  return { items, online, syncing, syncNow, retry };
}
