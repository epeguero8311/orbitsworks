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
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { ClockEvent } from "@/lib/types";
import { deriveStatus, accumulateWorkedMs, getAccumulatedWorkedMs } from "@/lib/clockStatus";
import {
  DayAttendance,
  effectiveDate,
  isSameDay,
  getWeekStart,
} from "@/lib/dashboardOverviewUtils";

const DISPLAY_LIMIT = 8;

export function useDashboardStatus() {
  const { userData, currentUser } = useAuth();
  const { settings } = useCompanySettings();
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyAttendance, setWeeklyAttendance] = useState<DayAttendance[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [weeklyHoursByEmployee, setWeeklyHoursByEmployee] = useState<Map<string, number>>(new Map());

  const autoClosedRef = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    if (!userData?.companyId) return;

    async function loadWeeklyHours() {
      try {
        const startOfWeek = getWeekStart(new Date());

        const eventsRef = collection(
          db,
          "companies",
          userData!.companyId,
          "clockEvents"
        );
        // Query bound stays on raw timestamp intentionally (same reasoning
        // as useReports.ts - a correction shouldn't move an event in/out of
        // the week window). Pairing/duration math below uses effective time.
        const q = query(
          eventsRef,
          where("timestamp", ">=", Timestamp.fromDate(startOfWeek)),
          orderBy("timestamp", "asc")
        );
        const snapshot = await getDocs(q);
        const weekEvents = snapshot.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<ClockEvent, "id">) }) as ClockEvent
        );

        // Re-sort by effective time so a corrected event pairs up in the
        // right chronological order even if its raw timestamp is out of line.
        weekEvents.sort((a, b) => {
          const aMs = effectiveDate(a)?.getTime() ?? 0;
          const bMs = effectiveDate(b)?.getTime() ?? 0;
          return aMs - bMs;
        });

        const byEmployee = new Map<string, ClockEvent[]>();
        for (const event of weekEvents) {
          const list = byEmployee.get(event.employeeId) ?? [];
          list.push(event);
          byEmployee.set(event.employeeId, list);
        }

        // accumulateWorkedMs excludes breakStart-to-breakEnd spans instead
        // of counting the whole in-to-out span as worked, and carries the
        // total across multiple breaks within the week without resetting it.
        const hoursMap = new Map<string, number>();
        const nowMs = Date.now();
        for (const [employeeId, empEvents] of byEmployee) {
          const totalMs = accumulateWorkedMs(empEvents, nowMs);
          hoursMap.set(employeeId, totalMs / (1000 * 60 * 60));
        }

        setWeeklyHoursByEmployee(hoursMap);
      } catch (err) {
        console.error("Weekly hours error:", err);
      }
    }

    loadWeeklyHours();
  }, [userData?.companyId, events]);

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

  useEffect(() => {
    if (!userData?.companyId || !settings.attendanceRules.autoClockOut) return;

    const now = new Date();
    const stale = currentlyActive.filter((event) => {
      const d = effectiveDate(event);
      return d && !isSameDay(d, now);
    });

    stale.forEach(async (event) => {
      if (autoClosedRef.current.has(event.id)) return;
      autoClosedRef.current.add(event.id);

      try {
        const clockInDate = effectiveDate(event)!;
        const [closeH, closeM] = settings.businessHours.close
          .split(":")
          .map(Number);
        const closeTime = new Date(clockInDate);
        closeTime.setHours(closeH, closeM, 0, 0);

        const eventsRef = collection(
          db,
          "companies",
          userData!.companyId,
          "clockEvents"
        );

        // If they were left on break, close the break first so it doesn't
        // stay open forever once the shift itself is force-closed.
        if (deriveStatus(event.type) === "break") {
          await addDoc(eventsRef, {
            employeeId: event.employeeId,
            employeeName: event.employeeName,
            siteId: event.siteId,
            siteName: event.siteName,
            subcontractorId: event.subcontractorId ?? null,
            subcontractorName: event.subcontractorName ?? null,
            type: "breakEnd",
            source: "autoBreakEnd",
            createdByUid: currentUser?.uid,
            timestamp: Timestamp.fromDate(closeTime),
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
          source: "adminManual",
          note: "Auto clocked out (end of business hours) - enabled in Settings",
          createdByUid: currentUser?.uid,
          timestamp: Timestamp.fromDate(closeTime),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Auto clock-out error:", err);
      }
    });
  }, [
    currentlyActive,
    settings.attendanceRules.autoClockOut,
    settings.businessHours.close,
    userData?.companyId,
  ]);

  return {
    loading,
    loadingChart,
    weeklyAttendance,
    weeklyHoursByEmployee,
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
  };
}
