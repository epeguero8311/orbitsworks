"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Users,
  Building2,
  Clock,
  Coffee,
  Download,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { useAlertActions } from "@/lib/hooks/useAlertActions";
import { ClockEvent } from "@/lib/types";
import { deriveStatus } from "@/lib/clockStatus";

type DayAttendance = {
  label: string;
  count: number;
};

// A correction (correctClockEvent) intentionally never touches the raw
// `timestamp` field - only `adjustedTimestamp`. Anything on this page that
// judges an employee's CURRENT status (who's active, who's on break, elapsed
// hours, alert day-checks) must use the effective time below, or a back-dated
// correction can silently desync the live view from reality. Raw `timestamp`
// stays reserved for Firestore query bounds only (see loadWeeklyAttendance /
// loadWeeklyHours), matching the same intentional split used in useReports.ts.
function effectiveTimestamp(event: ClockEvent) {
  return event.adjustedTimestamp ?? event.timestamp;
}

function effectiveDate(event: ClockEvent): Date | null {
  const ts = effectiveTimestamp(event);
  return ts ? ts.toDate() : null;
}

function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function dateKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  loading,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-2xl font-semibold text-gray-950">
            {loading ? "-" : value}
          </p>
        </div>
      </div>
    </div>
  );
}

type AlertItem = {
  key: string;
  alertType: "maxHours" | "missedClockOut" | "overtime" | "breakTooLong";
  label: string;
  detail: string;
  employeeId: string;
  event?: ClockEvent;
};

export default function DashboardOverviewPage() {
  const { userData, currentUser } = useAuth();
  const { employees, loading: loadingEmployees } = useEmployees();
  const { settings } = useCompanySettings();
  const { resolvedKeys } = useAlertActions();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyAttendance, setWeeklyAttendance] = useState<DayAttendance[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [weeklyHoursByEmployee, setWeeklyHoursByEmployee] = useState<Map<string, number>>(new Map());

  const [editingAlertKey, setEditingAlertKey] = useState<string | null>(null);
  const [editTimeValue, setEditTimeValue] = useState("");
  const [alertActionSubmitting, setAlertActionSubmitting] = useState<string | null>(null);
  const [alertActionError, setAlertActionError] = useState<string | null>(null);

  const autoClosedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      setCompanyName(snapshot.exists() ? snapshot.data().name ?? null : null);
    });
    return unsubscribe;
  }, [userData?.companyId]);

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

        const hoursMap = new Map<string, number>();
        for (const [employeeId, empEvents] of byEmployee) {
          let totalMs = 0;
          let pendingIn: ClockEvent | null = null;
          for (const event of empEvents) {
            if (event.type === "in") {
              pendingIn = event;
            } else if (event.type === "out" && pendingIn) {
              const pendingMs = effectiveDate(pendingIn)?.getTime();
              const eventMs = effectiveDate(event)?.getTime();
              if (pendingMs != null && eventMs != null) {
                totalMs += eventMs - pendingMs;
              }
              pendingIn = null;
            }
          }
          if (pendingIn) {
            const pendingMs = effectiveDate(pendingIn)?.getTime();
            if (pendingMs != null) {
              totalMs += Date.now() - pendingMs;
            }
          }
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
  const activeDisplay = currentlyActive.slice(0, 8);
  const activeOverflow = currentlyActive.length - activeDisplay.length;
  const totalActive = currentlyActive.length;

  const onBreakDisplay = currentlyOnBreak.slice(0, 8);
  const onBreakOverflow = currentlyOnBreak.length - onBreakDisplay.length;

  // Approximate: elapsed time since each employee's most recent status
  // change. If someone is mid-shift after a break, this reflects time since
  // they returned from break, not their original clock-in - the exact
  // payroll math (with break time subtracted from the whole shift) happens
  // in Reports, not this live overview.
  const avgHoursWorked = (() => {
    if (currentlyActive.length === 0) return "0h";
    const totalHours = currentlyActive.reduce((sum, event) => {
      const d = effectiveDate(event);
      if (!d) return sum;
      const elapsedMs = Date.now() - d.getTime();
      return sum + elapsedMs / (1000 * 60 * 60);
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

  const alertItems: AlertItem[] = [];
  const now = new Date();

  if (settings.alerts.maxHoursWarning) {
    currentlyActive
      .filter((event) => {
        const d = effectiveDate(event);
        return d && isSameDay(d, now);
      })
      .forEach((event) => {
        const d = effectiveDate(event)!;
        const elapsedHours = (Date.now() - d.getTime()) / (1000 * 60 * 60);
        if (elapsedHours >= settings.alerts.maxHoursThreshold) {
          alertItems.push({
            key: `max-${event.employeeId}-${dateKey(d)}`,
            alertType: "maxHours",
            label: event.employeeName,
            detail: `Clocked in for ${elapsedHours.toFixed(1)}h - check in?`,
            employeeId: event.employeeId,
            event,
          });
        }
      });
  }

  if (settings.alerts.missedClockOutAlert && !settings.attendanceRules.autoClockOut) {
    currentlyActive
      .filter((event) => {
        const d = effectiveDate(event);
        return d && !isSameDay(d, now);
      })
      .forEach((event) => {
        const d = effectiveDate(event)!;
        alertItems.push({
          key: `missed-${event.employeeId}-${dateKey(d)}`,
          alertType: "missedClockOut",
          label: event.employeeName,
          detail: `Still clocked in from ${d.toLocaleDateString()} - missed clock-out.`,
          employeeId: event.employeeId,
          event,
        });
      });
  }

  if (settings.alerts.overtimeWarning) {
    const weekStartStr = dateKey(getWeekStart(now));
    for (const [employeeId, hours] of weeklyHoursByEmployee) {
      if (hours > settings.weeklyOvertimeThreshold) {
        const employee = employees.find((e) => e.id === employeeId);
        alertItems.push({
          key: `ot-${employeeId}-${weekStartStr}`,
          alertType: "overtime",
          label: employee?.name ?? "Unknown employee",
          detail: `${hours.toFixed(1)}h this week - over the ${settings.weeklyOvertimeThreshold}h threshold.`,
          employeeId,
        });
      }
    }
  }

  if (settings.alerts.maxBreakWarning) {
    currentlyOnBreak.forEach((event) => {
      const d = effectiveDate(event);
      if (!d) return;
      const elapsedMinutes = (Date.now() - d.getTime()) / (1000 * 60);
      if (elapsedMinutes >= settings.alerts.maxBreakMinutes) {
        alertItems.push({
          key: `break-${event.employeeId}-${dateKey(d)}`,
          alertType: "breakTooLong",
          label: event.employeeName,
          detail: `On break for ${elapsedMinutes.toFixed(0)}m - over the ${settings.alerts.maxBreakMinutes}m limit.`,
          employeeId: event.employeeId,
          event,
        });
      }
    });
  }

  const visibleAlertItems = alertItems.filter((a) => !resolvedKeys.has(a.key));

  async function recordAlertAction(
    alert: AlertItem,
    status: "ignored" | "resolved",
    actionTaken?: "clockOut" | "editTime" | "endBreak"
  ) {
    if (!userData?.companyId || !currentUser) return;
    const actionsRef = collection(
      db,
      "companies",
      userData.companyId,
      "alertActions"
    );
    await addDoc(actionsRef, {
      alertKey: alert.key,
      alertType: alert.alertType,
      employeeId: alert.employeeId,
      status,
      ...(actionTaken ? { actionTaken } : {}),
      resolvedByUid: currentUser.uid,
      resolvedByName: currentUser.displayName || currentUser.email || "Admin",
      resolvedAt: serverTimestamp(),
    });
  }

  async function handleIgnoreAlert(alert: AlertItem) {
    setAlertActionSubmitting(alert.key);
    setAlertActionError(null);
    try {
      await recordAlertAction(alert, "ignored");
    } catch (err) {
      console.error("Ignore alert error:", err);
      setAlertActionError("Couldn't ignore this alert. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }

  async function handleClockOutFromAlert(alert: AlertItem) {
    if (!alert.event || !userData?.companyId) return;
    setAlertActionSubmitting(alert.key);
    setAlertActionError(null);
    try {
      const eventsRef = collection(
        db,
        "companies",
        userData.companyId,
        "clockEvents"
      );
      await addDoc(eventsRef, {
        employeeId: alert.event.employeeId,
        employeeName: alert.event.employeeName,
        siteId: alert.event.siteId,
        siteName: alert.event.siteName,
        subcontractorId: alert.event.subcontractorId ?? null,
        subcontractorName: alert.event.subcontractorName ?? null,
        type: "out",
        source: "adminManual",
        note: "Clocked out from alert",
        createdByUid: currentUser?.uid,
        timestamp: Timestamp.fromDate(new Date()),
        createdAt: serverTimestamp(),
      });
      await recordAlertAction(alert, "resolved", "clockOut");
    } catch (err) {
      console.error("Clock out from alert error:", err);
      setAlertActionError("Couldn't clock out. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }

  async function handleEndBreakFromAlert(alert: AlertItem) {
    if (!alert.event || !userData?.companyId) return;
    setAlertActionSubmitting(alert.key);
    setAlertActionError(null);
    try {
      const eventsRef = collection(
        db,
        "companies",
        userData.companyId,
        "clockEvents"
      );
      await addDoc(eventsRef, {
        employeeId: alert.event.employeeId,
        employeeName: alert.event.employeeName,
        siteId: alert.event.siteId,
        siteName: alert.event.siteName,
        subcontractorId: alert.event.subcontractorId ?? null,
        subcontractorName: alert.event.subcontractorName ?? null,
        type: "breakEnd",
        source: "adminManual",
        note: "Break ended from alert",
        createdByUid: currentUser?.uid,
        timestamp: Timestamp.fromDate(new Date()),
        createdAt: serverTimestamp(),
      });
      await recordAlertAction(alert, "resolved", "endBreak");
    } catch (err) {
      console.error("End break from alert error:", err);
      setAlertActionError("Couldn't end break. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }

  function handleStartEditTime(alert: AlertItem) {
    const base = alert.event ? effectiveDate(alert.event) ?? new Date() : new Date();
    setEditingAlertKey(alert.key);
    setEditTimeValue(toDatetimeLocalValue(base));
    setAlertActionError(null);
  }

  function handleCancelEditTime() {
    setEditingAlertKey(null);
    setEditTimeValue("");
    setAlertActionError(null);
  }

  async function handleSubmitEditTime(alert: AlertItem) {
    if (!alert.event || !userData?.companyId || !editTimeValue) return;
    setAlertActionSubmitting(alert.key);
    setAlertActionError(null);
    try {
      const chosenMs = new Date(editTimeValue).getTime();
      if (!Number.isFinite(chosenMs)) {
        throw new Error("Invalid date/time.");
      }
      const eventsRef = collection(
        db,
        "companies",
        userData.companyId,
        "clockEvents"
      );
      await addDoc(eventsRef, {
        employeeId: alert.event.employeeId,
        employeeName: alert.event.employeeName,
        siteId: alert.event.siteId,
        siteName: alert.event.siteName,
        subcontractorId: alert.event.subcontractorId ?? null,
        subcontractorName: alert.event.subcontractorName ?? null,
        type: "out",
        source: "adminManual",
        note: "Clock-out time set from alert",
        createdByUid: currentUser?.uid,
        timestamp: Timestamp.fromDate(new Date(chosenMs)),
        createdAt: serverTimestamp(),
      });
      await recordAlertAction(alert, "resolved", "editTime");
      setEditingAlertKey(null);
      setEditTimeValue("");
    } catch (err) {
      console.error("Edit time from alert error:", err);
      setAlertActionError(
        err instanceof Error ? err.message : "Couldn't save this time."
      );
    } finally {
      setAlertActionSubmitting(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950">
            Welcome, {companyName ?? "..."}
          </h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Here's what's happening across your job sites today.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/reports"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-950 transition-colors hover:border-gray-300"
          >
            <Download className="h-4 w-4" />
            Download Report
          </Link>
          <Link
            href="/dashboard/employees"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <UserPlus className="h-4 w-4" />
            Add Employee
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          label="Active job sites"
          value={activeSites.length}
          loading={loading}
        />
        <StatCard
          icon={Users}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Active employees"
          value={totalActive}
          loading={loading}
        />
        <StatCard
          icon={Coffee}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          label="On break"
          value={currentlyOnBreak.length}
          loading={loading}
        />
        <StatCard
          icon={Clock}
          iconBg="bg-green-50"
          iconColor="text-green-600"
          label="Avg. hrs worked / employee"
          value={avgHoursWorked}
          loading={loading}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-950">
            Weekly attendance
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Unique employees clocked in each day, last 7 days.
          </p>
          <div className="mt-6 h-64">
            {loadingChart ? (
              <p className="text-sm text-gray-600">Loading...</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyAttendance}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 13, fill: "#6b7280" }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 13, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    cursor={{ fill: "#fafafa" }}
                    contentStyle={{
                      fontSize: 13,
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <Bar dataKey="count" fill="#3b6fe0" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-950">
              Job site breakdown
            </h2>
            <Link
              href="/dashboard/sites"
              className="text-sm font-medium text-accent hover:underline"
            >
              View all
            </Link>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Live headcount per location.
          </p>
          <div className="mt-6 space-y-5">
            {loading ? (
              <p className="text-sm text-gray-600">Loading...</p>
            ) : activeSites.length === 0 ? (
              <p className="text-sm text-gray-600">
                No sites currently staffed.
              </p>
            ) : (
              activeSites.map(([siteName, count]) => {
                const pct = totalActive
                  ? Math.round((count / totalActive) * 100)
                  : 0;
                return (
                  <div key={siteName}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-950">
                        {siteName}
                      </span>
                      <span className="text-gray-600">
                        {count} {count === 1 ? "person" : "people"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-950">Alerts</h2>
        <p className="mt-1 text-sm text-gray-600">
          Driven by your alert settings - turn these on or off in Settings.
        </p>
        {alertActionError && (
          <p className="mt-3 text-xs text-red-600">{alertActionError}</p>
        )}
        <div className="mt-5 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : visibleAlertItems.length === 0 ? (
            <p className="text-sm text-gray-600">No alerts right now.</p>
          ) : (
            visibleAlertItems.map((alert) => {
              const isEditing = editingAlertKey === alert.key;
              const isSubmitting = alertActionSubmitting === alert.key;
              return (
                <div
                  key={alert.key}
                  className="rounded-lg bg-amber-50 p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-950">
                        {alert.label}
                      </p>
                      <p className="text-xs text-gray-600">{alert.detail}</p>

                      {isEditing ? (
                        <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-white p-3">
                          <label className="block text-xs font-medium text-gray-600">
                            Clock-out time
                          </label>
                          <input
                            type="datetime-local"
                            value={editTimeValue}
                            onChange={(e) => setEditTimeValue(e.target.value)}
                            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                          />
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              disabled={isSubmitting || !editTimeValue}
                              onClick={() => handleSubmitEditTime(alert)}
                              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSubmitting ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEditTime}
                              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-3">
                          {alert.alertType === "breakTooLong" && (
                            <>
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleEndBreakFromAlert(alert)}
                                className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                End Break
                              </button>
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleStartEditTime(alert)}
                                className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Edit Time
                              </button>
                            </>
                          )}
                          {alert.alertType !== "overtime" && alert.alertType !== "breakTooLong" && (
                            <>
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleClockOutFromAlert(alert)}
                                className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Clock Out
                              </button>
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleStartEditTime(alert)}
                                className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Edit Time
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleIgnoreAlert(alert)}
                            className="text-xs font-medium text-gray-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSubmitting ? "Working..." : "Ignore"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-950">
            Employees clocked in
          </h2>
          <Link
            href="/dashboard/time"
            className="text-sm font-medium text-accent hover:underline"
          >
            View all
          </Link>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-gray-600">Loading...</p>
        ) : currentlyActive.length === 0 ? (
          <p className="p-6 text-sm text-gray-600">
            No one is currently clocked in.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-6 py-3 font-medium">Employee</th>
                <th className="px-6 py-3 font-medium">Job site</th>
                <th className="px-6 py-3 font-medium">Since</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {activeDisplay.map((event) => {
                const isOnBreak = deriveStatus(event.type) === "break";
                const d = effectiveDate(event);
                return (
                  <tr
                    key={event.employeeId}
                    className="border-b border-gray-200 last:border-0"
                  >
                    <td className="px-6 py-4 font-medium text-gray-950">
                      {event.employeeName}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {event.siteName}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {d ? timeAgo(d) : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          isOnBreak
                            ? "bg-amber-50 text-amber-700"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        {isOnBreak ? "On break" : "Active"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {activeOverflow > 0 && (
          <Link
            href="/dashboard/time"
            className="block border-t border-gray-200 px-6 py-3 text-center text-sm font-medium text-accent hover:underline"
          >
            +{activeOverflow} more
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-950">
            On break
          </h2>
          <Link
            href="/dashboard/time"
            className="text-sm font-medium text-accent hover:underline"
          >
            View all
          </Link>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-gray-600">Loading...</p>
        ) : currentlyOnBreak.length === 0 ? (
          <p className="p-6 text-sm text-gray-600">
            No one is currently on break.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-6 py-3 font-medium">Employee</th>
                <th className="px-6 py-3 font-medium">Job site</th>
                <th className="px-6 py-3 font-medium">On break for</th>
                <th className="px-6 py-3 font-medium">Authorized by</th>
              </tr>
            </thead>
            <tbody>
              {onBreakDisplay.map((event) => {
                const d = effectiveDate(event);
                return (
                  <tr
                    key={event.employeeId}
                    className="border-b border-gray-200 last:border-0"
                  >
                    <td className="px-6 py-4 font-medium text-gray-950">
                      {event.employeeName}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {event.siteName}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {d ? timeAgo(d) : "-"}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {event.authorizedByName || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {onBreakOverflow > 0 && (
          <Link
            href="/dashboard/time"
            className="block border-t border-gray-200 px-6 py-3 text-center text-sm font-medium text-accent hover:underline"
          >
            +{onBreakOverflow} more
          </Link>
        )}
      </div>
    </div>
  );
}
