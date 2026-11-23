import { useCallback, useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useFocusEffect } from "@react-navigation/native";
import { db } from "../firebase";
import { readFiredReminders } from "../breakReminderScheduler";
import { ALERTS_TAB_LIMIT, mergeAlerts, reminderRow, serverAlertRow } from "../employeeAlertsView";

const LOADING_MAX_MS = 4000;

// Employee App Phase 7 - the Alerts tab: the employee's own server alerts
// (live, newest 50; rules allow only their own) merged with the break
// reminders this phone already showed. Read only. Offline (Firestore here
// is memory-only) the server part is empty and the phone's part still shows.
// -> { alerts, loading }
export function useEmployeeAlerts(companyId, employeeId) {
  const [server, setServer] = useState({ rows: [], loaded: false });
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    if (!companyId || !employeeId) return undefined;
    const q = query(
      collection(db, "companies", companyId, "employeeAlerts"),
      where("employeeId", "==", employeeId),
      orderBy("createdAt", "desc"),
      limit(ALERTS_TAB_LIMIT)
    );
    const markLoaded = () => setServer((prev) => (prev.loaded ? prev : { rows: prev.rows, loaded: true }));
    // Offline the listener may not answer for a while: stop the spinner.
    const timer = setTimeout(markLoaded, LOADING_MAX_MS);
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        setServer({ rows: snap.docs.map((d) => serverAlertRow(d.id, d.data(), now)), loaded: true });
      },
      (err) => {
        console.log("[useEmployeeAlerts] listener error:", err.code, err.message);
        markLoaded();
      }
    );
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [companyId, employeeId]);

  // The phone's log changes while the app runs (a reminder comes due), so
  // it is read each time the tab is shown.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      readFiredReminders(companyId, employeeId, Date.now()).then((log) => {
        if (active) setReminders(log.map(reminderRow));
      });
      return () => {
        active = false;
      };
    }, [companyId, employeeId])
  );

  return { alerts: mergeAlerts(server.rows, reminders), loading: !server.loaded && reminders.length === 0 };
}
