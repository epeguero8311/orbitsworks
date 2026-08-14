"use client";

import { useEffect, useState, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { Employee } from "@/lib/types";

export function useEmployees() {
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
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Employee, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Employees listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

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