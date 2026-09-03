"use client";

import { useCallback, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { ClockEvent, Job } from "@/lib/types";
import { dateKey, startOfWeek } from "@/lib/reportUtils";

export type EmployeeHistoryDayRow = {
  dateLabel: string;
  weekLabel: string;
  siteName: string;
  clockInLabel: string;
  clockOutLabel: string;
  hours: number;
  breakHours: number;
  note: string;
  adjusted: boolean;
};

export type EmployeeHistoryWeek = {
  weekLabel: string;
  hours: number;
};

export type EmployeeTimesheet = {
  employeeName: string;
  hourlyRate: number | null;
  defaultJobId: string | null;
  jobs: Job[];
  dayRows: EmployeeHistoryDayRow[];
  weeklyTotals: EmployeeHistoryWeek[];
};

type EventWithDate = Omit<ClockEvent, "id"> & {
  id: string;
  timestamp: Timestamp;
  wasAdjusted: boolean;
};

export function useEmployeeTimesheet() {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runTimesheet = useCallback(
    async (
      employeeId: string,
      startDate: string,
      endDate: string
    ): Promise<EmployeeTimesheet | null> => {
      if (!userData?.companyId) return null;
      setError("");
      setLoading(true);
      try {
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T23:59:59`);

        const employeeSnap = await getDoc(
          doc(db, "companies", userData.companyId, "employees", employeeId)
        );
        const employeeData = employeeSnap.exists()
          ? (employeeSnap.data() as {
              name?: string;
              hourlyRate?: number | null;
              jobId?: string | null;
            })
          : {};

        const jobsSnapshot = await getDocs(
          collection(db, "companies", userData.companyId, "jobs")
        );
        const jobsMap = new Map<string, Job>();
        jobsSnapshot.docs.forEach((d) => {
          const data = d.data() as Omit<Job, "id">;
          jobsMap.set(d.id, { id: d.id, ...data });
        });
        const jobs = Array.from(jobsMap.values());

        const hourlyRate = employeeData.jobId
          ? jobsMap.get(employeeData.jobId)?.hourlyRate ?? null
          : employeeData.hourlyRate ?? null;

        const eventsRef = collection(db, "companies", userData.companyId, "clockEvents");
        const q = query(
          eventsRef,
          where("employeeId", "==", employeeId),
          where("timestamp", ">=", Timestamp.fromDate(start)),
          where("timestamp", "<=", Timestamp.fromDate(end)),
          orderBy("timestamp", "asc")
        );
        const snapshot = await getDocs(q);
        const events: EventWithDate[] = snapshot.docs.map((d) => {
          const data = d.data() as Omit<ClockEvent, "id">;
          const effective = (data.adjustedTimestamp ?? data.timestamp) as Timestamp;
          return { ...data, id: d.id, timestamp: effective, wasAdjusted: !!data.adjustedTimestamp };
        });

        const dayRows: EmployeeHistoryDayRow[] = [];
        let pendingIn: EventWithDate | null = null;
        let openBreakStart: EventWithDate | null = null;
        let currentSessionBreakMs = 0;
        let sessionAdjusted = false;
        let sessionNotes: string[] = [];
        const weeklyMs = new Map<string, number>();

        for (const event of events) {
          if (event.note && event.type !== "in") sessionNotes.push(event.note);

          if (event.type === "in") {
            pendingIn = event;
            openBreakStart = null;
            currentSessionBreakMs = 0;
            sessionAdjusted = event.wasAdjusted;
            sessionNotes = event.note ? [event.note] : [];
          } else if (event.type === "breakStart") {
            if (pendingIn && !openBreakStart) openBreakStart = event;
          } else if (event.type === "breakEnd") {
            if (openBreakStart) {
              const ms = event.timestamp.toMillis() - openBreakStart.timestamp.toMillis();
              if (ms > 0) currentSessionBreakMs += ms;
              openBreakStart = null;
            }
          } else if (event.type === "out" && pendingIn) {
            if (event.wasAdjusted) sessionAdjusted = true;
            const durationMs = event.timestamp.toMillis() - pendingIn.timestamp.toMillis();
            if (durationMs > 0) {
              const netMs = durationMs - currentSessionBreakMs;
              const weekKey = dateKey(startOfWeek(pendingIn.timestamp.toDate()));
              weeklyMs.set(weekKey, (weeklyMs.get(weekKey) ?? 0) + netMs);

              dayRows.push({
                dateLabel: pendingIn.timestamp.toDate().toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }),
                weekLabel: new Date(weekKey + "T00:00:00").toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                }),
                siteName: pendingIn.siteName,
                clockInLabel: pendingIn.timestamp.toDate().toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                }),
                clockOutLabel: event.timestamp.toDate().toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                }),
                hours: durationMs / (1000 * 60 * 60),
                breakHours: currentSessionBreakMs / (1000 * 60 * 60),
                note: sessionNotes.join("; "),
                adjusted: sessionAdjusted,
              });
            }
            pendingIn = null;
            openBreakStart = null;
            currentSessionBreakMs = 0;
            sessionAdjusted = false;
            sessionNotes = [];
          }
        }

        const weeklyTotals: EmployeeHistoryWeek[] = Array.from(weeklyMs.entries())
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([weekKey, ms]) => ({
            weekLabel: new Date(weekKey + "T00:00:00").toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
            hours: ms / (1000 * 60 * 60),
          }));

        return {
          employeeName: employeeData.name ?? "Unknown employee",
          hourlyRate,
          defaultJobId: employeeData.jobId ?? null,
          jobs,
          dayRows,
          weeklyTotals,
        };
      } catch (err) {
        console.error("Employee timesheet error:", err);
        setError("Couldn't build this employee's timesheet. Try again.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [userData?.companyId]
  );

  return { runTimesheet, loading, error };
}