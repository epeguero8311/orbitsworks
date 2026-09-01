"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { Subcontractor } from "@/lib/types";
export function useSubcontractors() {
  const { userData } = useAuth();
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userData?.companyId) return;
    const subcontractorsRef = collection(
      db,
      "companies",
      userData.companyId,
      "subcontractors"
    );
    const unsubscribe = onSnapshot(
      subcontractorsRef,
      (snapshot) => {
        setSubcontractors(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Subcontractor, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Subcontractors listener error:", err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [userData?.companyId]);
  return { subcontractors, loading };
}