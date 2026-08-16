"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { Job } from "@/lib/types";

export function useJobs() {
  const { userData } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;

    const jobsRef = collection(db, "companies", userData.companyId, "jobs");

    const unsubscribe = onSnapshot(
      jobsRef,
      (snapshot) => {
        setJobs(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Job, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Jobs listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  return { jobs, loading };
}