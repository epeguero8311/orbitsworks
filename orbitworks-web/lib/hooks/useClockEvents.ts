"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  QueryConstraint,
} from "firebase/firestore";
import { db, functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { fetchShiftData, SERVER_REFRESH_MS } from "@/lib/shiftData";
import { useAuth } from "@/lib/AuthContext";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { deriveStatus, ClockStatus } from "@/lib/clockStatus";
import { isSameDay } from "@/lib/dashboardOverviewUtils";
import type { ClockEvent, Employee, JobSite } from "@/lib/types";

export type ClockDirection = "in" | "out" | "breakStart" | "breakEnd";

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
  // Task 4 (D2): a restricted admin gets the latest events of their sites'
  // shifts from the server (last 8 days), refreshed every 30 s.
  const { serverReads } = useAdminAccess();
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!userData?.companyId) return;
    if (serverReads) {
      let cancelled = false;
      const load = () =>
        fetchShiftData({ purpose: "shifts", startMs: Date.now() - 8 * 86400000, endMs: Date.now() + 60000, want: { clockEvents: true } })
          .then((res) => {
            if (cancelled) return;
            const evs = res.clockEvents
              .map((d) => ({ id: d.id, ...(d.data() as Omit<ClockEvent, "id">) }))
              .sort((a, b) => (b.timestamp?.toMillis() ?? 0) - (a.timestamp?.toMillis() ?? 0))
              .slice(0, 50);
            setRecentEvents(evs);
            setLoading(false);
          })
          .catch((err) => {
            console.error("Clock events server load error:", err);
            if (!cancelled) setLoading(false);
          });
      load();
      const timer = setInterval(load, SERVER_REFRESH_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }

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
  }, [userData?.companyId, serverReads, refreshTick]);

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
  // shift. This happens when the mobile app never wrote the closing event
  // (e.g. the employee forgot to clock out and never opened the app
  // again). Without this, such an employee is permanently stuck:
  // isEligibleFor("in") stays false forever, so they can never be selected
  // to clock in again without first being manually clocked out as a
  // separate step.
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

  // Task 4 (D18): the Time page's manual clock actions go through ONE
  // server call for every admin (adminClockAction: Approve hours + the
  // shift's site). A stale open session from a prior day is closed first at
  // that day's business close (or end of day if they clocked in after
  // close), backdated as before; on clock-out a running break is ended
  // first (server side, source autoBreakEnd).
  async function recordManualClockEvent(
    employee: Employee,
    site: JobSite | undefined,
    direction: ClockDirection,
    note: string
  ) {
    if (!userData?.companyId || !currentUser) return;

    let closeStaleAtMs: number | undefined;
    if (direction === "in" && isStaleOpenSession(employee.id)) {
      const staleEvent = latestEventFor(employee.id);
      const staleTs = staleEvent ? staleEvent.adjustedTimestamp ?? staleEvent.timestamp : undefined;
      if (staleTs) {
        const staleDate = staleTs.toDate();
        const [closeH, closeM] = settings.businessHours.close.split(":").map(Number);
        const closeTime = new Date(staleDate);
        closeTime.setHours(closeH, closeM, 0, 0);
        if (closeTime.getTime() <= staleDate.getTime()) {
          closeTime.setHours(23, 59, 0, 0);
        }
        closeStaleAtMs = closeTime.getTime();
      }
    }

    const fn = httpsCallable(functions, "adminClockAction");
    await fn({
      employeeId: employee.id,
      action: direction,
      ...(direction === "in" ? { siteId: site?.id ?? null } : {}),
      note: note.trim(),
      ...(closeStaleAtMs ? { closeStaleAtMs } : {}),
    });
    if (serverReads) setRefreshTick((t) => t + 1);
  }

  async function searchClockEvents(
    filters: ClockEventSearchFilters
  ): Promise<ClockEvent[]> {
    if (!userData?.companyId) return [];

    // Task 4 (D2): restricted admins search their sites through the server.
    if (serverReads) {
      const fromMs = filters.fromDate ? new Date(`${filters.fromDate}T00:00:00`).getTime() : Date.now() - 90 * 86400000;
      const toMs = filters.toDate ? new Date(`${filters.toDate}T23:59:59`).getTime() : Date.now() + 60000;
      const res = await fetchShiftData({
        purpose: "shifts",
        startMs: fromMs,
        endMs: toMs,
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        want: { clockEvents: true },
      });
      return res.clockEvents
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ClockEvent, "id">) }))
        .filter((e) => !filters.siteId || e.siteId === filters.siteId)
        .sort((a, b) => (b.timestamp?.toMillis() ?? 0) - (a.timestamp?.toMillis() ?? 0))
        .slice(0, 100);
    }

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
