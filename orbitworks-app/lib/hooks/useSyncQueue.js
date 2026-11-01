import { useCallback, useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../AuthContext";
import { getDb } from "../db";
import { subscribeQueueChange } from "../queueEvents";
import { drainQueue, isQueueSyncing, retryQueueItem } from "../queueSync";
import { drainEmployeeQueue } from "../employeeQueueSync";
import { drainEmployeeUpdateQueue } from "../employeeUpdateQueueSync";
import { subscribeEmployeeQueueChange } from "../employeeQueueEvents";
import { syncPinTable } from "../pinSync";

// Employee creates/updates shown in the same list as clock events.
// 'rejected' is their final "won't retry" state (clock events use 'dead').
function employeeRows(creates, updates) {
  return [
    ...creates.map((r) => ({
      localId: `employee-create-${r.localId}`,
      kind: "employee",
      type: "employeeCreate",
      employeeId: r.employeeId,
      employeeName: r.name,
      clientTimestamp: r.createdAt,
      syncStatus: r.syncStatus,
      attempts: r.attempts,
      lastError: r.lastError,
      syncedAt: r.syncedAt,
    })),
    ...updates.map((r) => ({
      localId: `employee-update-${r.localId}`,
      kind: "employee",
      type: "employeeUpdate",
      employeeId: r.employeeId,
      employeeName: r.employeeName || r.name || "Employee",
      clientTimestamp: r.createdAt,
      syncStatus: r.syncStatus,
      attempts: r.attempts,
      lastError: r.lastError,
      syncedAt: r.syncedAt,
    })),
  ];
}

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
      const [events, creates, updates] = await Promise.all([
        sqlite.getAllAsync("SELECT * FROM event_queue ORDER BY clientTimestamp DESC"),
        sqlite.getAllAsync("SELECT * FROM employee_queue"),
        sqlite.getAllAsync("SELECT * FROM employee_update_queue"),
      ]);
      // A clock event for an employee whose create hasn't synced yet waits
      // for it (queueSync.js) - flagged so the list can say so.
      const waitingFor = new Set(
        (creates ?? [])
          .filter((r) => ["pending", "syncing", "failed"].includes(r.syncStatus))
          .map((r) => r.employeeId)
      );
      const clockRows = (events ?? []).map((r) => ({
        ...r,
        kind: "clock",
        waitingForEmployee: r.syncStatus === "pending" && waitingFor.has(r.employeeId),
      }));
      const merged = [...clockRows, ...employeeRows(creates ?? [], updates ?? [])];
      merged.sort((a, b) => b.clientTimestamp - a.clientTimestamp);
      setRows(merged);
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
    const unsubscribeEmployeeQueue = subscribeEmployeeQueueChange(refresh);
    const netSub = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    NetInfo.fetch().then((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });

    return () => {
      unsubscribeQueue();
      unsubscribeEmployeeQueue();
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
    (r) =>
      !(
        r.syncStatus === "synced" &&
        // Employee rows synced by an older build have no syncedAt - hide them.
        (r.syncedAt ? now - r.syncedAt >= SYNCED_DISPLAY_MS : r.kind === "employee")
      )
  );

  // A full, two-way sync, not just the device's own outbound queue -
  // "Sync Now" used to only push (drainQueue), so a clock-out recorded
  // elsewhere (the web admin dashboard, another device) while this
  // device was open stayed invisible here no matter how many times this
  // was pressed, since nothing ever pulled fresh server state back down.
  // syncPinTable() is what actually refreshes pin_cache.lastEventType/
  // lastEventTimestamp that getCurrentLocalStatus (clockStatusLocal.js)
  // compares against. If a drain is already running, drainQueue wakes it
  // (and clears retry backoff) rather than starting a second one.
  const syncNow = useCallback(async () => {
    if (!companyId) return;
    setPulling(true);
    try {
      await Promise.all([
        syncPinTable().catch(() => {}),
        drainQueue(companyId, "syncNow"),
        drainEmployeeQueue(companyId).catch(() => {}),
        drainEmployeeUpdateQueue(companyId).catch(() => {}),
      ]);
    } finally {
      setPulling(false);
    }
  }, [companyId]);

  // Un-dead-letters a single row: resets attempts/lastError and puts it
  // back to 'pending' so the next drain (triggered right after) will
  // pick it up again. Dead rows are otherwise permanently excluded from
  // drainQueue's own SELECT, so without this they would sit forever.
  const retry = useCallback(
    async (localId) => {
      await retryQueueItem(localId);
      if (companyId) drainQueue(companyId, "retry");
    },
    [companyId]
  );

  return { items, online, syncing: syncing || pulling, syncNow, retry };
}
