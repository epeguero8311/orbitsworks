"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { AlertItem } from "@/lib/dashboardOverviewUtils";
import type { MobileAlert } from "@/lib/types";
import { ALERTS_MAX, alertsSince } from "@/lib/alertsWindow";

// Live view of companies/{companyId}/alerts (functions/src/alerts.ts) -
// the same server-generated alerts the mobile Alerts tab reads, in place
// of the old client-side computation dashboardOverviewUtils.ts's
// buildAlertItems used to do. Deterministic alert ids double as the
// alertKey alertActions already resolves/ignores by (max-/ot-/missed-/
// break- match exactly what buildAlertItems used to generate), so nothing
// about the "Clock Out"/"Edit Time"/"Ignore" actions or their history
// changes - only where the alert's own description comes from.
//
// This dashboard is admin/owner-only (supervisors are redirected to
// /mobile-only in app/dashboard/layout.tsx), so unlike the mobile Alerts
// tab there's no per-supervisor site filtering to apply here.
//
// Phase 10 (W8 a): only alerts from the last 30 days, newest first, at most
// 200 (lib/alertsWindow.ts) - it used to read every alert ever. The window
// is fixed when the page opens. count = how many came back (the cap note).
export function useServerAlerts() {
  const { userData } = useAuth();
  const companyId = userData?.companyId;
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Same pattern useDashboardStatus.ts/useCompanySettings.ts already use
    // for this same "not authenticated yet" case - state just stays at its
    // initial default (empty alerts, loading) rather than setting it
    // synchronously in the effect body.
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "alerts"),
      where("occurredAt", ">=", Timestamp.fromDate(alertsSince(Date.now()))),
      orderBy("occurredAt", "desc"),
      limit(ALERTS_MAX)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: AlertItem[] = snapshot.docs.map((d) => {
          const data = d.data() as Omit<MobileAlert, "id">;
          return {
            key: d.id,
            alertType: data.alertType,
            label: data.employeeName ?? data.siteName ?? "All Sites",
            detail: data.message,
            employeeId: data.employeeId ?? "",
            eventId: data.eventId,
            // employeeUpdated's severity is per-instance (set by
            // createEmployeeUpdatedAlert), not the fixed ALERT_SEVERITY[type]
            // lookup every other type still uses - AlertsPanel.tsx prefers
            // this field, falling back to that lookup if it's ever missing.
            severity: data.severity,
            employeeUpdateId: data.employeeUpdateId,
          };
        });
        setAlerts(items);
        setLoading(false);
      },
      (err) => {
        console.error("Server alerts listener error:", err);
        setAlerts([]);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [companyId]);

  return { alerts, loading };
}
