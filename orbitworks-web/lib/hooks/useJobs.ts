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
import { appendRateHistory } from "@/lib/rateHistory";
import { appendOvertimeRateHistory } from "@/lib/jobOvertimeRate";
import { jobSchema } from "@/lib/validators/job";
import type { Job } from "@/lib/types";

// A changed Overtime rate (Task 1) gets its own effective-dated history,
// same "Effective from" date the hourly rate prompt uses.
export type OvertimeRateChange = {
  previousOvertimeRate: number | null;
  previousHistory?: Job["overtimeRateHistory"];
  effectiveFrom: string;
};

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

  // Throws the validator's message on bad input, so the caller's existing
  // catch shows it.
  async function addJob(name: string, hourlyRate: number, overtimeRate: number | null = null) {
    if (!userData?.companyId) return;
    const parsed = jobSchema.parse({ name, hourlyRate, overtimeRate });
    const jobsRef = collection(db, "companies", userData.companyId, "jobs");
    await addDoc(jobsRef, {
      name: parsed.name,
      hourlyRate: parsed.hourlyRate,
      // Only written when set, so titles added without one look exactly
      // like titles saved before Overtime existed.
      ...(parsed.overtimeRate != null ? { overtimeRate: parsed.overtimeRate } : {}),
      active: true,
      createdAt: serverTimestamp(),
    });
  }

  async function updateJob(
    jobId: string,
    name: string,
    hourlyRate: number,
    rateChange?: { previousRate: number; previousHistory?: Job["rateHistory"]; effectiveFrom: string },
    // Overtime (Task 1). undefined = leave overtimeRate untouched (old
    // callers); otherwise the new value plus its history change, if any.
    overtime?: { overtimeRate: number | null; change?: OvertimeRateChange }
  ) {
    if (!userData?.companyId) return;
    const parsed = jobSchema.parse({
      name,
      hourlyRate,
      overtimeRate: overtime ? overtime.overtimeRate : null,
    });
    const jobRef = doc(db, "companies", userData.companyId, "jobs", jobId);
    const updates: Record<string, unknown> = {
      name: parsed.name,
      hourlyRate: parsed.hourlyRate,
    };
    if (overtime) {
      updates.overtimeRate = parsed.overtimeRate;
      if (overtime.change) {
        updates.overtimeRateHistory = appendOvertimeRateHistory(
          overtime.change.previousHistory,
          overtime.change.previousOvertimeRate,
          parsed.overtimeRate,
          overtime.change.effectiveFrom
        );
      }
    }
    if (rateChange) {
      updates.rateHistory = appendRateHistory(
        rateChange.previousHistory,
        rateChange.previousRate,
        hourlyRate,
        rateChange.effectiveFrom
      );
    }
    await updateDoc(jobRef, updates);
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
