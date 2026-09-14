"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
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
    const q = query(jobsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
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

  async function addJob(name: string, hourlyRate: number) {
    if (!userData?.companyId) return;
    const jobsRef = collection(db, "companies", userData.companyId, "jobs");
    await addDoc(jobsRef, {
      name: name.trim(),
      hourlyRate,
      active: true,
      createdAt: serverTimestamp(),
    });
  }

  async function updateJob(jobId: string, name: string, hourlyRate: number) {
    if (!userData?.companyId) return;
    const jobRef = doc(db, "companies", userData.companyId, "jobs", jobId);
    await updateDoc(jobRef, {
      name: name.trim(),
      hourlyRate,
    });
  }

  async function toggleJobActive(job: Job) {
    if (!userData?.companyId) return;
    const jobRef = doc(db, "companies", userData.companyId, "jobs", job.id);
    await updateDoc(jobRef, { active: !job.active });
  }

  async function deleteJob(jobId: string) {
    if (!userData?.companyId) return;
    const jobRef = doc(db, "companies", userData.companyId, "jobs", jobId);
    await deleteDoc(jobRef);
  }

  return { jobs, loading, addJob, updateJob, toggleJobActive, deleteJob };
}
