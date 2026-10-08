"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { EmployeeUpdate } from "@/lib/types";

// Update Employee (mobile) - live view of companies/{companyId}/employeeUpdates,
// so AlertsPanel.tsx can resolve an employeeUpdated alert's full old/new
// name + side-by-side photos by employeeUpdateId, same role useDevices.ts's
// bounded listener plays elsewhere. Bounded rather than paginated (same
// tradeoff useDevices.ts/useEmployees.ts already accept) - recent alerts
// only ever reference recent updates.
const RECENT_UPDATES_LIMIT = 100;

export function useEmployeeUpdates() {
  const { userData } = useAuth();
  const [employeeUpdates, setEmployeeUpdates] = useState<EmployeeUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;

    const updatesRef = collection(db, "companies", userData.companyId, "employeeUpdates");
    const q = query(updatesRef, orderBy("createdAt", "desc"), limit(RECENT_UPDATES_LIMIT));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setEmployeeUpdates(
          snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmployeeUpdate, "id">) }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Employee updates listener error:", err);
        setEmployeeUpdates([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  return { employeeUpdates, loading };
}
