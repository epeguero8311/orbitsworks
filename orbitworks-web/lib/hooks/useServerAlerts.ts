"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { AlertItem } from "@/lib/dashboardOverviewUtils";
import type { MobileAlert } from "@/lib/types";

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

    const q = query(collection(db, "companies", companyId, "alerts"), orderBy("occurredAt", "desc"));
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
