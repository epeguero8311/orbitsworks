"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { localDateKey } from "@/lib/reportUtils";
import type { ClockEvent, Flag, TimesheetApproval } from "@/lib/types";

export type ApprovalRow = {
  key: string;
  employeeId: string;
  employeeName: string;
  companyName: string;
  isSubcontractor: boolean;
  date: string;
  siteName: string;
  siteId: string | null;
  hours: number | null;
  breakHours: number | null;
  status: "pending" | "approved";
  eventId: string;
  clockInEvent: ClockEvent;
  clockOutEvent: ClockEvent;
  sessionEventIds: string[];
  isClockedInNow: boolean;
  flags: Flag[];
};

type EventWithId = Omit<ClockEvent, "id"> & { id: string };

export type ManualTimestampParams = {
  employeeId: string;
  date: string;
  clockInTime: string;
  clockOutTime: string;
  breakStartTime?: string | null;
  breakEndTime?: string | null;
  siteId: string | null;
  // Omit entirely to use the employee's current company. null = force
  // main company. string = a specific subcontractor id.
  subcontractorId?: string | null;
  reason: string;
};

export function useTimesheetApprovals(startDate: string, endDate: string = startDate) {
  const { userData } = useAuth();
  const { employees } = useEmployees();
  const { settings } = useCompanySettings();
  const [events, setEvents] = useState<EventWithId[]>([]);
  const [approvals, setApprovals] = useState<Map<string, TimesheetApproval>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userData?.companyId) return;
    setLoading(true);

    const start = new Date(`${startDate}T00:00:00`);
    // A session that clocks in on the last displayed day can clock out
    // after midnight, into the next calendar day. The query has to
    // range-filter on the raw `timestamp` field (never adjustedTimestamp -
    // an admin correction must never move a session in or out of the
    // fetched window), so it fetches one extra day past endDate to make
    // sure that clock-out event is pulled in too. Sessions are bucketed by
    // their clock-in day below, so this buffer day's own sessions get
    // filtered back out of the final rows - it only exists to complete
    // sessions that started inside the requested range.
    const end = new Date(`${endDate}T23:59:59`);
    end.setDate(end.getDate() + 1);

    const eventsRef = collection(db, "companies", userData.companyId, "clockEvents");
    const eventsQuery = query(
      eventsRef,
      where("timestamp", ">=", Timestamp.fromDate(start)),
      where("timestamp", "<=", Timestamp.fromDate(end))
    );

    const unsubEvents = onSnapshot(
      eventsQuery,
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
        console.error("Timesheet approvals events listener error:", err);
        setError("Couldn't load clock events for this range.");
        setLoading(false);
      }
    );

    const approvalsRef = collection(db, "companies", userData.companyId, "timesheetApprovals");
    const approvalsQuery = query(
      approvalsRef,
      where("date", ">=", startDate),
      where("date", "<=", endDate)
    );

    const unsubApprovals = onSnapshot(
      approvalsQuery,
      (snapshot) => {
        const map = new Map<string, TimesheetApproval>();
        snapshot.docs.forEach((d) => {
          map.set(d.id, { id: d.id, ...(d.data() as Omit<TimesheetApproval, "id">) });
        });
        setApprovals(map);
      },
      (err) => {
        console.error("Timesheet approvals listener error:", err);
      }
    );

    return () => {
      unsubEvents();
      unsubApprovals();
    };
  }, [userData?.companyId, startDate, endDate]);

  const rows = useMemo<ApprovalRow[]>(() => {
    const mainCompanyName = settings?.name || "Main company";
    const activeEmployeesById = new Map(employees.filter((e) => e.active).map((e) => [e.id, e]));

    const byEmployee = new Map<string, EventWithId[]>();
    for (const ev of events) {
      const list = byEmployee.get(ev.employeeId) ?? [];
      list.push(ev);
      byEmployee.set(ev.employeeId, list);
    }
    byEmployee.forEach((list) =>
      list.sort((a, b) => {
        const at = (a.adjustedTimestamp ?? a.timestamp)?.toMillis() ?? 0;
        const bt = (b.adjustedTimestamp ?? b.timestamp)?.toMillis() ?? 0;
        return at - bt;
      })
    );

    const allRows: ApprovalRow[] = [];
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const rangeIncludesToday = startDate <= todayKey && todayKey <= endDate;

    byEmployee.forEach((empEvents, employeeId) => {
      const employee = activeEmployeesById.get(employeeId);
      if (!employee) return;

      const isClockedInNow =
        rangeIncludesToday &&
        empEvents.length > 0 &&
        empEvents[empEvents.length - 1].type !== "out";
      const companyName = employee.subcontractorId
        ? employee.subcontractorName || "Subcontractor"
        : mainCompanyName;
      const isSubcontractor = !!employee.subcontractorId;

      let pendingIn: EventWithId | null = null;
      let breakMs = 0;
      let openBreakStart: EventWithId | null = null;
      let sessionIds: string[] = [];

      for (const ev of empEvents) {
        const ts = (ev.adjustedTimestamp ?? ev.timestamp)?.toDate();
        if (!ts) continue;

        if (ev.type === "in") {
          pendingIn = ev;
          breakMs = 0;
          openBreakStart = null;
          sessionIds = [ev.id];
        } else if (ev.type === "breakStart") {
          if (pendingIn && !openBreakStart) {
            openBreakStart = ev;
            sessionIds.push(ev.id);
          }
        } else if (ev.type === "breakEnd") {
          if (openBreakStart) {
            const openTs = (openBreakStart.adjustedTimestamp ?? openBreakStart.timestamp)!.toDate();
            const ms = ts.getTime() - openTs.getTime();
            if (ms > 0) breakMs += ms;
            openBreakStart = null;
            sessionIds.push(ev.id);
          }
        } else if (ev.type === "out" && pendingIn) {
          const inTs = (pendingIn.adjustedTimestamp ?? pendingIn.timestamp)!.toDate();
          const durationMs = ts.getTime() - inTs.getTime();
          sessionIds.push(ev.id);

          if (durationMs > 0) {
            const approval = approvals.get(pendingIn.id);
            allRows.push({
              key: pendingIn.id,
              employeeId: employee.id,
              employeeName: employee.name,
              companyName,
              isSubcontractor,
              date: approval?.date ?? localDateKey(inTs),
              siteName: pendingIn.siteName || "Not specified",
              siteId: pendingIn.siteId ?? null,
              hours: durationMs / (1000 * 60 * 60),
              breakHours: breakMs / (1000 * 60 * 60),
              status: approval?.status ?? "pending",
              eventId: pendingIn.id,
              clockInEvent: { ...pendingIn },
              clockOutEvent: { ...ev },
              sessionEventIds: sessionIds,
              isClockedInNow,
              flags: approval?.flags ?? [],
            });
          }
          pendingIn = null;
          breakMs = 0;
          openBreakStart = null;
          sessionIds = [];
        }
      }
    });

    // The events query above fetches one buffer day past endDate so an
    // overnight session's clock-out is available for pairing. A session
    // belongs to the day it clocked in, not out, so drop any session
    // paired from that buffer day here - this is the single place both
    // Day and Week mode go through, so they can never disagree on which
    // day a session belongs to.
    const visibleRows = allRows.filter((r) => r.date >= startDate && r.date <= endDate);

    visibleRows.sort((a, b) =>
      a.date === b.date ? a.employeeName.localeCompare(b.employeeName) : a.date.localeCompare(b.date)
    );
    return visibleRows;
  }, [employees, events, approvals, startDate, endDate, settings?.name]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === "pending").length,
    [rows]
  );

  const addManualTimestamp = async (params: ManualTimestampParams) => {
    const fn = httpsCallable(functions, "addManualTimestamp");
    await fn(params);
  };

  const setApprovalStatus = async (eventId: string, status: "pending" | "approved") => {
    const fn = httpsCallable(functions, "setApprovalStatus");
    await fn({ eventId, status });
  };

  const setApprovalStatusBulk = async (eventIds: string[], status: "pending" | "approved") => {
    const fn = httpsCallable(functions, "setApprovalStatusBulk");
    await fn({ eventIds, status });
  };

  const deleteTimesheetSession = async (approvalId: string, eventIds: string[]) => {
    const fn = httpsCallable(functions, "deleteTimesheetSession");
    await fn({ approvalId, eventIds });
  };

  return {
    rows,
    pendingCount,
    loading,
    error,
    addManualTimestamp,
    setApprovalStatus,
    setApprovalStatusBulk,
    deleteTimesheetSession,
  };
}