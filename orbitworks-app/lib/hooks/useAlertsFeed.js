import { useCallback, useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit, doc, arrayUnion, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useLocalEmployee } from "./useLocalEmployee";
import { getOrCreatePushDeviceId } from "../pushDeviceId";
import { markLaunch, noteLaunchCount } from "../launchTiming";

const WEB_ONLY_ALERT_TYPES = ["autoClockOut", "syncWrongPin", "syncedLateApproved", "pinChanged"];

// Live view of companies/{companyId}/alerts, newest first. Fails to an
// empty list rather than an error (kill-switch-off or unreachable both
// look the same to this tab - nothing to show, not a broken screen).
// Supervisors see company-wide alerts (siteId null - overtime) plus
// anything scoped to one of their assigned sites; admins see everything.
// Read state is per-device (readByDeviceIds), so a shared login on
// several phones tracks "seen" independently per device. Nothing marks an
// alert read automatically - only the "Mark all read" button
// (AlertsScreen.js) does, via markAllRead below. Opening the tab never
// changes read state on its own.
//
// Only the newest ALERTS_LIMIT alerts are loaded (all of them was ~950 KB
// for ShipMate on every cold start). Unread counts and "Mark Seen" cover
// those alerts; the tab badge shows "9+" above 9, so it never shows a
// wrong large number.
export const ALERTS_LIMIT = 100;

export function useAlertsFeed() {
  const { userData, linkedEmployeeId } = useAuth();
  const companyId = userData?.companyId;
  const isSupervisor = userData?.role === "supervisor";
  const localEmployee = useLocalEmployee(linkedEmployeeId);
  const assignedSiteIds = localEmployee?.assignedSiteIds ?? [];

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState(null);

  useEffect(() => {
    getOrCreatePushDeviceId().then(setDeviceId);
  }, []);

  useEffect(() => {
    if (!companyId) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "companies", companyId, "alerts"),
      orderBy("occurredAt", "desc"),
      limit(ALERTS_LIMIT)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // Auto Clock-Out and the Employee App Phase 4 sync alerts
        // (syncWrongPin, syncedLateApproved) are admin/owner web-only per
        // spec - never shown in the mobile Alerts tab and never pushed.
        // The alerts collection itself is shared/generic (no per-type
        // filter server-side), so this is the one place that has to know
        // to drop them.
        setAlerts(
          snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            // pinChanged is web-only too - the phone shows its own local
            // notice for it (employeeSyncAlerts).
            .filter((a) => !WEB_ONLY_ALERT_TYPES.includes(a.alertType))
        );
        setLoading(false);
        noteLaunchCount("alerts", snapshot.size);
        markLaunch("alertsLoaded");
      },
      (err) => {
        console.log("Alerts feed error:", err.message);
        setAlerts([]);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [companyId]);

  const visibleAlerts = isSupervisor
    ? alerts.filter((a) => !a.siteId || assignedSiteIds.includes(a.siteId))
    : alerts;

  const withReadState = visibleAlerts.map((a) => ({
    ...a,
    unread: deviceId ? !(a.readByDeviceIds ?? []).includes(deviceId) : false,
  }));

  const unreadCount = withReadState.filter((a) => a.unread).length;

  const markAllRead = useCallback(async () => {
    if (!companyId || !deviceId) return;
    const unread = withReadState.filter((a) => a.unread);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((a) => {
        batch.update(doc(db, "companies", companyId, "alerts", a.id), {
          readByDeviceIds: arrayUnion(deviceId),
        });
      });
      await batch.commit();
    } catch (e) {
      console.log("markAllRead failed:", e.message);
    }
  }, [companyId, deviceId, withReadState]);

  return { alerts: withReadState, unreadCount, loading, markAllRead };
}
