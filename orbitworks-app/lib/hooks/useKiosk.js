import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "../AuthContext";
import { getKioskTableSnapshot, loadKioskTable, subscribeKioskTable, syncKioskTable } from "../kioskPinStore";
import { addKioskPunch, getKioskMeta, listKioskPunches, subscribeKioskQueue } from "../kioskQueue";
import { syncKioskQueue } from "../kioskQueueSync";
import { drainEmployeeQueue } from "../employeeQueueSync";
import { punchClockFields } from "../clockAnchor";
import { currentStatus, kioskCommentFor } from "../kioskLogic";
import { newRequestId } from "../employeeClockApi";
import { getLocationPermissionStatus, requestLocationPermission } from "../locationPermission";

// Task 5 Kiosk mode - everything the kiosk screens share: the PIN table
// (lib/kioskPinStore.js), the saved punches (lib/kioskQueue.js) and sending
// them (lib/kioskQueueSync.js). Mounted once for a kiosk login (App.js), so
// the refresh timers run the whole time the iPad is in Kiosk mode.
//   PIN table: on start, every 20 minutes, back in the foreground, on
//              reconnect, and when a screen asks (refreshTable)
//   punches:   right after each one, every 30 s while any is waiting, on
//              reconnect and back in the foreground

const TABLE_EVERY_MS = 20 * 60 * 1000;
const QUEUE_EVERY_MS = 30 * 1000;

const KioskContext = createContext(null);

export function KioskProvider({ children }) {
  const { currentUser, userData } = useAuth();
  const uid = currentUser?.uid ?? null;
  const companyId = userData?.companyId ?? null;
  const snap = useSyncExternalStore(subscribeKioskTable, getKioskTableSnapshot);
  const [items, setItems] = useState([]);
  const [lastPunchSyncMs, setLastPunchSyncMs] = useState(null);

  const refreshItems = useCallback(() => {
    if (!uid) return;
    Promise.all([listKioskPunches(uid), getKioskMeta("lastSyncedAtMs")])
      .then(([list, meta]) => {
        setItems(list);
        const v = Number(meta);
        setLastPunchSyncMs(Number.isFinite(v) && v > 0 ? v : null);
      })
      .catch(() => {
        // keep what we had
      });
  }, [uid]);

  const refreshTable = useCallback(() => (uid ? syncKioskTable(uid) : Promise.resolve(null)), [uid]);
  // Task 5 v2 (5): also sends Create account rows saved offline (same
  // employee_queue as the supervisor app, kiosk rows only for this login).
  const sendNow = useCallback(
    () =>
      uid
        ? Promise.all([syncKioskQueue(uid).catch(() => {}), companyId ? drainEmployeeQueue(companyId).catch(() => {}) : null])
        : Promise.resolve(),
    [uid, companyId]
  );

  // Pro job-site auto-detect needs a location fix on each punch: ask once
  // (only while the iPad has never been asked). Kiosk Settings shows it.
  useEffect(() => {
    if (!uid) return;
    getLocationPermissionStatus()
      .then((s) => (s && s.status === "undetermined" ? requestLocationPermission() : null))
      .catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    loadKioskTable(uid).finally(() => refreshTable());
    refreshItems();
    sendNow();
    const unsubQueue = subscribeKioskQueue(() => refreshItems());
    const tableTimer = setInterval(refreshTable, TABLE_EVERY_MS);
    const queueTimer = setInterval(sendNow, QUEUE_EVERY_MS);
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        refreshTable();
        sendNow();
      }
    });
    let wasOffline = false;
    const net = NetInfo.addEventListener((s) => {
      const offline = s.isConnected === false || s.isInternetReachable === false;
      if (wasOffline && !offline) {
        refreshTable();
        sendNow();
      }
      wasOffline = offline;
    });
    return () => {
      unsubQueue();
      clearInterval(tableTimer);
      clearInterval(queueTimer);
      app.remove();
      net();
    };
  }, [uid, refreshTable, refreshItems, sendNow]);

  // Saves a punch (every kiosk punch is queued first, like the supervisor
  // app) and starts sending it. location: a fix from startPunchFix().take().
  const recordPunch = useCallback(
    async ({ employee, action, pin, photoUri, location, comment }) => {
      if (!uid || !companyId) throw new Error("Not signed in");
      const requestId = newRequestId();
      const clock = await punchClockFields();
      await addKioskPunch({
        requestId,
        companyId,
        kioskUid: uid,
        employeeId: employee.id,
        employeeName: employee.name,
        action,
        pin,
        photoUri: photoUri || null,
        location: location === undefined ? null : location,
        clock,
        employeeComment: kioskCommentFor(action, comment),
      });
      sendNow();
      return { requestId, atMs: Date.now() };
    },
    [uid, companyId, sendNow]
  );

  const value = useMemo(() => {
    const table = snap.table;
    const unsent = items.filter((i) => i.status === "waiting" || i.status === "syncing");
    const failed = items.filter((i) => i.status === "failed");
    const lastSyncedMs = Math.max(table?.syncedAtMs ?? 0, lastPunchSyncMs ?? 0) || null;
    return {
      uid,
      companyId,
      table,
      tableStatus: snap.status,
      isPro: table ? table.isPro : true,
      createAccount: !!table && table.isPro && table.createAccount === true,
      requireAdminPin: !!table && table.requireAdminPin === true,
      kioskName: table?.kioskName || userData?.name || "Kiosk",
      items,
      unsentCount: unsent.length,
      failed,
      lastSyncedMs,
      statusOf: (employee) => currentStatus(employee, items),
      recordPunch,
      refreshTable,
      sendNow,
    };
  }, [snap, items, lastPunchSyncMs, uid, companyId, userData?.name, recordPunch, refreshTable, sendNow]);

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
  return useContext(KioskContext);
}
