"use client";

import { useEffect, useState, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { Employee } from "@/lib/types";

// Task 5 (K8): kiosk records (shared iPads) are left out by default - they
// never clock in, so they never belong in Time, Approve Hours, pickers or
// counts. The Team page (EmployeesPageView) and Devices pass
// { includeKiosks: true }.
export function useEmployees({ includeKiosks = false }: { includeKiosks?: boolean } = {}) {
  const { userData } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;

    const employeesRef = collection(
      db,
      "companies",
      userData.companyId,
      "employees"
    );
    const q = query(employeesRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setEmployees(
          snapshot.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Employee, "id">),
            }))
            .filter((e) => includeKiosks || e.kiosk !== true)
        );
        setLoading(false);
      },
      (err) => {
        console.error("Employees listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId, includeKiosks]);

  const toggleEmployeeActive = useCallback(
    async (employeeId: string, active: boolean) => {
      setEmployees((prev) =>
        prev.map((e) => (e.id === employeeId ? { ...e, active } : e))
      );

      try {
        const setEmployeeActiveFn = httpsCallable(functions, "setEmployeeActive");
        await setEmployeeActiveFn({ employeeId, active });
      } catch (err) {
        setEmployees((prev) =>
          prev.map((e) => (e.id === employeeId ? { ...e, active: !active } : e))
        );
        throw err;
      }
    },
    []
  );

  return { employees, loading, toggleEmployeeActive };
}