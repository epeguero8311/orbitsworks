"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { ClockEvent } from "@/lib/types";
import { deriveStatus, getAccumulatedWorkedMs } from "@/lib/clockStatus";
import { DayAttendance, effectiveDate } from "@/lib/dashboardOverviewUtils";

const DISPLAY_LIMIT = 8;

export type DeactivatedBackfill = {
  key: string;
  employeeId: string;
  employeeName: string;
  closedAt: Date;
};

export function useDashboardStatus() {
  const { userData, currentUser } = useAuth();
  const { employees } = useEmployees();
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyAttendance, setWeeklyAttendance] = useState<DayAttendance[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [deactivatedBackfills, setDeactivatedBackfills] = useState<DeactivatedBackfill[]>([]);

  const deactivatedClosedRef = useRef<Set<string>>(new Set());

  function dismissDeactivatedBackfill(key: string) {
    setDeactivatedBackfills((prev) => prev.filter((b) => b.key !== key));
  }

  useEffect(() => {
    if (!userData?.companyId) return;
    const eventsRef = collection(
      db,
      "companies",
      userData.companyId,
      "clockEvents"
    );
    const q = query(eventsRef, orderBy("timestamp", "desc"), limit(200));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setEvents(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ClockEvent, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Overview listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  useEffect(() => {
    if (!userData?.companyId) return;

    async function loadWeeklyAttendance() {
      setLoadingChart(true);
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const eventsRef = collection(
          db,
          "companies",
          userData!.companyId,
          "clockEvents"
        );
        const q = query(
          eventsRef,
          where("timestamp", ">=", Timestamp.fromDate(sevenDaysAgo)),
          where("type", "==", "in"),
          orderBy("timestamp", "asc")
        );
        const snapshot = await getDocs(q);

        const dayBuckets = new Map<string, Set<string>>();
        const dayLabels: string[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(sevenDaysAgo);
          d.setDate(d.getDate() + i);
          const key = d.toDateString();
          dayLabels.push(key);
          dayBuckets.set(key, new Set());
        }

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as ClockEvent;
          if (!data.timestamp) return;
          const key = data.timestamp.toDate().toDateString();
          if (dayBuckets.has(key)) {
            dayBuckets.get(key)!.add(data.employeeId);
          }
        });

        const result: DayAttendance[] = dayLabels.map((key) => {
          const date = new Date(key);
          return {
            label: date.toLocaleDateString(undefined, { weekday: "short" }),
            count: dayBuckets.get(key)?.size ?? 0,
          };
        });

        setWeeklyAttendance(result);
      } catch (err) {
        console.error("Weekly attendance error:", err);
      } finally {
        setLoadingChart(false);
      }
    }

    loadWeeklyAttendance();
  }, [userData?.companyId]);

  // Determine each employee's latest event by EFFECTIVE time, not by the
  // order Firestore returned (which is raw-timestamp order). A back-dated
  // correction on an old event must not make it outrank a genuinely newer
  // event just because its raw timestamp field never moved.
  const latestByEmployee = new Map<string, ClockEvent>();
  for (const event of events) {
    const eventMs = effectiveDate(event)?.getTime() ?? 0;
    const existing = latestByEmployee.get(event.employeeId);
    const existingMs = existing ? effectiveDate(existing)?.getTime() ?? 0 : -1;
    if (!existing || eventMs > existingMs) {
      latestByEmployee.set(event.employeeId, event);
    }
  }

  // "Active" now covers anyone on shift, whether working or on break -
  // someone on break has not clocked out, so they should still count.
  const currentlyActive = Array.from(latestByEmployee.values()).filter(
    (e) => deriveStatus(e.type) !== "out"
  );
  const currentlyOnBreak = currentlyActive.filter(
    (e) => deriveStatus(e.type) === "break"
  );
  const activeDisplay = currentlyActive.slice(0, DISPLAY_LIMIT);
  const activeOverflow = currentlyActive.length - activeDisplay.length;
  const totalActive = currentlyActive.length;

  const onBreakDisplay = currentlyOnBreak.slice(0, DISPLAY_LIMIT);
  const onBreakOverflow = currentlyOnBreak.length - onBreakDisplay.length;

  // Accumulated worked ms for the CURRENT shift, per currently-active
  // employee, with break time excluded but never reset by a break. This is
  // the single number both the Max Hours alert and the "Employees clocked
  // in" table read from - see getAccumulatedWorkedMs in clockStatus.ts.
  const nowForShift = new Date();
  const workedMsByEmployee = new Map<string, number>();
  for (const event of currentlyActive) {
    const employeeEvents = events.filter(
      (e) => e.employeeId === event.employeeId
    );
    workedMsByEmployee.set(
      event.employeeId,
      getAccumulatedWorkedMs(employeeEvents, nowForShift)
    );
  }

  const avgHoursWorked = (() => {
    if (currentlyActive.length === 0) return "0h";
    const totalHours = currentlyActive.reduce((sum, event) => {
      const ms = workedMsByEmployee.get(event.employeeId) ?? 0;
      return sum + ms / (1000 * 60 * 60);
    }, 0);
    return `${(totalHours / currentlyActive.length).toFixed(1)}h`;
  })();

  const activeSiteCounts = new Map<string, number>();
  for (const event of currentlyActive) {
    const key = event.siteName || "Not specified";
    activeSiteCounts.set(key, (activeSiteCounts.get(key) ?? 0) + 1);
  }
  const activeSites = Array.from(activeSiteCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  const inactiveEmployeeIds = new Set(
    employees.filter((e) => !e.active).map((e) => e.id)
  );

  // Backfill for sessions orphaned by deactivation: an already-inactive
  // employee with a still-open session (any age, not just multi-day-stale -
  // a same-day deactivation could race this). Runs unconditionally - this
  // is a data-integrity backfill, not an opt-in business rule. Flags each
  // one via console.warn and a dismissible banner - the hours for that day
  // are off either way since we don't know the real deactivation moment,
  // only when this check happened to run.
  useEffect(() => {
    if (!userData?.companyId) return;
    if (inactiveEmployeeIds.size === 0) return;

    const orphaned = currentlyActive.filter((event) =>
      inactiveEmployeeIds.has(event.employeeId)
    );

    orphaned.forEach(async (event) => {
      if (deactivatedClosedRef.current.has(event.id)) return;
      deactivatedClosedRef.current.add(event.id);

      try {
        const now = new Date();
        const eventsRef = collection(
          db,
          "companies",
          userData!.companyId,
          "clockEvents"
        );

        if (deriveStatus(event.type) === "break") {
          await addDoc(eventsRef, {
            employeeId: event.employeeId,
            employeeName: event.employeeName,
            siteId: event.siteId,
            siteName: event.siteName,
            subcontractorId: event.subcontractorId ?? null,
            subcontractorName: event.subcontractorName ?? null,
            type: "breakEnd",
            source: "employeeDeactivated",
            createdByUid: currentUser?.uid,
            timestamp: Timestamp.fromDate(now),
            createdAt: serverTimestamp(),
          });
        }

        await addDoc(eventsRef, {
          employeeId: event.employeeId,
          employeeName: event.employeeName,
          siteId: event.siteId,
          siteName: event.siteName,
          subcontractorId: event.subcontractorId ?? null,
          subcontractorName: event.subcontractorName ?? null,
          type: "out",
          source: "employeeDeactivated",
          note: "Backfilled: this employee was already deactivated with an open session - hours for that day may be inaccurate.",
          createdByUid: currentUser?.uid,
          timestamp: Timestamp.fromDate(now),
          createdAt: serverTimestamp(),
        });

        console.warn(
          `[Deactivated-employee backfill] Force-closed an orphaned open session for ${event.employeeName} (${event.employeeId}). Hours for that day may be inaccurate.`
        );
        setDeactivatedBackfills((prev) => [
          ...prev,
          {
            key: event.id,
            employeeId: event.employeeId,
            employeeName: event.employeeName,
            closedAt: now,
          },
        ]);
      } catch (err) {
        console.error("Deactivated-employee backfill clock-out error:", err);
      }
    });
  }, [currentlyActive, employees, userData?.companyId]);

  return {
    loading,
    loadingChart,
    // Geofencing (Pro) Part 4 - AlertsPanel needs the raw recent events
    // (not just the currentlyActive/currentlyOnBreak slices below) since
    // the geofence alert is about a past clock-in moment, not current
    // status - see buildGeofenceAlertItems.
    events,
    weeklyAttendance,
    currentlyActive,
    currentlyOnBreak,
    activeDisplay,
    activeOverflow,
    totalActive,
    onBreakDisplay,
    onBreakOverflow,
    workedMsByEmployee,
    avgHoursWorked,
    activeSites,
    deactivatedBackfills,
    dismissDeactivatedBackfill,
  };
}
