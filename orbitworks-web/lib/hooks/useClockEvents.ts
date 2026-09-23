"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { deriveStatus, ClockStatus } from "@/lib/clockStatus";
import { dateKey, isSameDay } from "@/lib/dashboardOverviewUtils";
import type { ClockEvent, Employee, JobSite } from "@/lib/types";

export type ClockDirection = "in" | "out" | "breakStart" | "breakEnd";

export class ClockValidationError extends Error {}

export type ClockEventSearchFilters = {
  employeeId?: string;
  siteId?: string;
  fromDate?: string;
  toDate?: string;
};

export function useClockEvents() {
  const { currentUser, userData } = useAuth();
  const { settings } = useCompanySettings();
  const [recentEvents, setRecentEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;

    const eventsRef = collection(
      db,
      "companies",
      userData.companyId,
      "clockEvents"
    );
    const q = query(eventsRef, orderBy("timestamp", "desc"), limit(50));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setRecentEvents(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ClockEvent, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Clock events status listener error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userData?.companyId]);

  // Determine each employee's LATEST event by effective time
  // (adjustedTimestamp ?? timestamp), not by the order Firestore returned
  // the docs in (raw timestamp order). A back-dated correction on an old
  // event must not keep outranking a genuinely newer event just because its
  // raw timestamp field never moved.
  const latestEventByEmployee = useMemo(() => {
    const latestByEmployee = new Map<string, ClockEvent>();
    for (const ev of recentEvents) {
      const ts = ev.adjustedTimestamp ?? ev.timestamp;
      const evMs = ts ? ts.toMillis() : 0;
      const existing = latestByEmployee.get(ev.employeeId);
      const existingTs = existing
        ? existing.adjustedTimestamp ?? existing.timestamp
        : undefined;
      const existingMs = existingTs ? existingTs.toMillis() : -1;
      if (!existing || evMs > existingMs) {
        latestByEmployee.set(ev.employeeId, ev);
      }
    }
    return latestByEmployee;
  }, [recentEvents]);

  const employeeStatusMap = useMemo(() => {
    const map: Record<string, ClockStatus> = {};
    for (const [employeeId, ev] of latestEventByEmployee) {
      map[employeeId] = deriveStatus(ev.type);
    }
    return map;
  }, [latestEventByEmployee]);

  function statusOf(id: string): ClockStatus {
    return employeeStatusMap[id] ?? "out";
  }

  function latestEventFor(id: string): ClockEvent | undefined {
    return latestEventByEmployee.get(id);
  }

  // True when an employee's current status is "in"/"break" only because
  // their session was never closed on a PRIOR day - not a real ongoing
  // shift. This happens when the source that would normally clock them out
  // (the mobile app, or the nightly autoClockOutStaleSessions job when a
  // company has that setting off) never wrote the closing event. Without
  // this, such an employee is permanently stuck: isEligibleFor("in") stays
  // false forever, so they can never be selected to clock in again without
  // first being manually clocked out as a separate step.
  function isStaleOpenSession(id: string): boolean {
    const status = statusOf(id);
    if (status === "out") return false;
    const ev = latestEventByEmployee.get(id);
    const ts = ev ? ev.adjustedTimestamp ?? ev.timestamp : undefined;
    if (!ts) return false;
    return !isSameDay(ts.toDate(), new Date());
  }

  function isEligibleFor(id: string, direction: ClockDirection) {
    const status = statusOf(id);
    if (direction === "in") return status === "out" || isStaleOpenSession(id);
    if (direction === "out") return status === "in" || status === "break";
    if (direction === "breakStart") return status === "in";
    return status === "break"; // breakEnd
  }

  async function recordManualClockEvent(
    employee: Employee,
    site: JobSite | undefined,
    direction: ClockDirection,
    note: string
  ) {
    if (!userData?.companyId || !currentUser) return;

    const now = new Date();

    if (direction === "in" || direction === "out") {
      const [openH, openM] = settings.businessHours.open.split(":").map(Number);
      const [closeH, closeM] = settings.businessHours.close.split(":").map(Number);
      const businessOpenToday = new Date(now);
      businessOpenToday.setHours(openH, openM, 0, 0);
      const businessCloseToday = new Date(now);
      businessCloseToday.setHours(closeH, closeM, 0, 0);

      if (
        direction === "in" &&
        !settings.attendanceRules.allowEarlyClockIn &&
        now < businessOpenToday
      ) {
        throw new ClockValidationError(
          `Early clock-in isn't allowed before ${settings.businessHours.open}. Enable it in Settings if needed.`
        );
      }

      if (
        direction === "out" &&
        !settings.attendanceRules.allowLateClockOut &&
        now > businessCloseToday
      ) {
        throw new ClockValidationError(
          `Late clock-out isn't allowed after ${settings.businessHours.close}. Enable it in Settings if needed.`
        );
      }
    }

    const eventsRef = collection(
      db,
      "companies",
      userData.companyId,
      "clockEvents"
    );

    // Close out a stale open session from a prior day before starting
    // today's, backdated to that day's business close (or end of day, if
    // they clocked in after close) - otherwise the "in" written below
    // would just extend a session that's actually days old instead of
    // starting a fresh one.
    if (direction === "in" && isStaleOpenSession(employee.id)) {
      const staleEvent = latestEventFor(employee.id);
      const staleTs = staleEvent
        ? staleEvent.adjustedTimestamp ?? staleEvent.timestamp
        : undefined;

      if (staleEvent && staleTs) {
        const staleDate = staleTs.toDate();
        const [closeH, closeM] = settings.businessHours.close
          .split(":")
          .map(Number);
        const closeTime = new Date(staleDate);
        closeTime.setHours(closeH, closeM, 0, 0);
        if (closeTime.getTime() <= staleDate.getTime()) {
          closeTime.setHours(23, 59, 0, 0);
        }

        await addDoc(eventsRef, {
          employeeId: employee.id,
          employeeName: employee.name,
          siteId: staleEvent.siteId ?? null,
          siteName: staleEvent.siteName ?? "Not specified",
          subcontractorId: employee.subcontractorId ?? null,
          subcontractorName: employee.subcontractorName ?? null,
          type: "out",
          source: "adminManual",
          note: `Auto-closed stale session from ${dateKey(staleDate)} before clocking in today`,
          createdByUid: currentUser.uid,
          timestamp: Timestamp.fromDate(closeTime),
          createdAt: serverTimestamp(),
        });
      }
    }

    if (direction === "out" && statusOf(employee.id) === "break") {
      await addDoc(eventsRef, {
        employeeId: employee.id,
        employeeName: employee.name,
        siteId: site?.id ?? null,
        siteName: site?.name ?? "Not specified",
        subcontractorId: employee.subcontractorId ?? null,
        subcontractorName: employee.subcontractorName ?? null,
        type: "breakEnd",
        source: "autoBreakEnd",
        createdByUid: currentUser.uid,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    }

    await addDoc(eventsRef, {
      employeeId: employee.id,
      employeeName: employee.name,
      siteId: site?.id ?? null,
      siteName: site?.name ?? "Not specified",
      subcontractorId: employee.subcontractorId ?? null,
      subcontractorName: employee.subcontractorName ?? null,
      type: direction,
      source: "adminManual",
      note: note.trim(),
      createdByUid: currentUser.uid,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  }

  async function searchClockEvents(
    filters: ClockEventSearchFilters
  ): Promise<ClockEvent[]> {
    if (!userData?.companyId) return [];

    const eventsRef = collection(
      db,
      "companies",
      userData.companyId,
      "clockEvents"
    );

    const constraints: QueryConstraint[] = [];
    if (filters.employeeId) {
      constraints.push(where("employeeId", "==", filters.employeeId));
    }
    if (filters.siteId) {
      constraints.push(where("siteId", "==", filters.siteId));
    }
    if (filters.fromDate) {
      constraints.push(
        where(
          "timestamp",
          ">=",
          Timestamp.fromDate(new Date(`${filters.fromDate}T00:00:00`))
        )
      );
    }
    if (filters.toDate) {
      constraints.push(
        where(
          "timestamp",
          "<=",
          Timestamp.fromDate(new Date(`${filters.toDate}T23:59:59`))
        )
      );
    }
    constraints.push(orderBy("timestamp", "desc"));
    constraints.push(limit(100));

    const q = query(eventsRef, ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<ClockEvent, "id">),
    }));
  }

  return {
    recentEvents,
    loading,
    statusOf,
    isEligibleFor,
    isStaleOpenSession,
    latestEventFor,
    recordManualClockEvent,
    searchClockEvents,
  };
}
