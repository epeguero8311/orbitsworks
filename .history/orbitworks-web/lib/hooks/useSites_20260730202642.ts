"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { JobSite } from "@/lib/types";

export function useSites() {
  const { userData } = useAuth();
  const [sites, setSites] = useState<JobSite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;

    const sitesRef = collection(
      db,
      "companies",
      userData.companyId,
      "jobSites"
    );

    const unsubscribe = onSnapshot(
      sitesRef,
      (snapshot) => {
        setSites(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<JobSite, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Sites listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  return { sites, loading };
}