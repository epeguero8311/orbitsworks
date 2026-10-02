import { useCallback, useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../AuthContext";
import { getDb } from "../db";
import { subscribeQueueChange } from "../queueEvents";
import { drainQueue, isQueueSyncing } from "../queueSync";
import { drainEmployeeQueue } from "../employeeQueueSync";
import { syncPinTable } from "../pinSync";

// How long a 'synced' row stays visible in the Sync Queue list after it
// finishes, purely for display - separate from queueSync.js's own
// SYNCED_RETENTION_MS, which keeps the row in SQLite for an hour for
// other consumers (useLocalStatusOverlay) and must not change.
const SYNCED_DISPLAY_MS = 3000;

// Read-only view of event_queue for the Sync Queue tab. Refreshes off the
// same notifyQueueChange pub/sub the offline overlay already uses, plus
// connectivity changes - never polls, and never writes to the table, so
// viewing this screen can't mutate, reorder, or drop anything queued.
export function useSyncQueue() {
  const { userData } = useAuth();
  const companyId = userData?.companyId;
  const [rows, setRows] = useState([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // Separate from queueSync.js's own `syncing` flag (isQueueSyncing),
  // which only ever covers drainQueue's own push - this also covers the
  // syncPinTable()/drainEmployeeQueue() pulls syncNow runs alongside it,
  // so the button shows "syncing" for the whole round trip, not just the
  // push half.
  const [pulling, setPulling] = useState(false);
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

  // A full, two-way sync, not just the device's own outbound queue -
  // "Sync Now" used to only push (drainQueue), so a clock-out recorded
  // elsewhere (the web admin dashboard, another device) while this
  // device was open stayed invisible here no matter how many times this
  // was pressed, since nothing ever pulled fresh server state back down.
  // syncPinTable() is what actually refreshes pin_cache.lastEventType/
  // lastEventTimestamp that getCurrentLocalStatus (clockStatusLocal.js)
  // compares against - drainQueue's own `syncing` guard still makes the
  // push half a no-op if a drain is already running, so this never opens
  // a second concurrent flush there.
  const syncNow = useCallback(async () => {
    if (!companyId) return;
    setPulling(true);
    try {
      await Promise.all([
        syncPinTable().catch(() => {}),
        drainQueue(companyId),
        drainEmployeeQueue(companyId).catch(() => {}),
      ]);
    } finally {
      setPulling(false);
    }
  }, [companyId]);

  return { items, online, syncing: syncing || pulling, syncNow };
}
