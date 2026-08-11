"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
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

  return { employees, loading };
}