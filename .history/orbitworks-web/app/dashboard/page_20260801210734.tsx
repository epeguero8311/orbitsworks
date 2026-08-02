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
  Download,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";

type ClockEvent = {
  id: string;
  employeeId: string;
  employeeName: string;
  siteId: string | null;
  siteName: string;
  type: "in" | "out";
  source: "faceMatch" | "supervisorOverride" | "adminManual";
  note?: string;
  timestamp?: Timestamp;
};

type DayAttendance = {
  label: string;
  count: number;
};

const MAX_SHIFT_HOURS = 8;

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
  label: string;
  detail: string;
};

export default function DashboardOverviewPage() {
  const { userData } = useAuth();
  const { employees, loading: loadingEmployees } = useEmployees();
  const { settings } = useCompanySettings();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyAttendance, setWeeklyAttendance] = useState<DayAttendance[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [weeklyHoursByEmployee, setWeeklyHoursByEmployee] = useState<Map<string, number>>(new Map());

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
        const startOfWeek = new Date();
        const day = startOfWeek.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
        startOfWeek.setHours(0, 0, 0, 0);

        const eventsRef = collection(
          db,
          "companies",
          userData!.companyId,
          "clockEvents"
        );
        const q = query(
          eventsRef,
          where("timestamp", ">=", Timestamp.fromDate(startOfWeek)),
          orderBy("timestamp", "asc")
        );
        const snapshot = await getDocs(q);
        const weekEvents = snapshot.docs.map(
          (d) => d.data() as ClockEvent
        );

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
              if (pendingIn.timestamp && event.timestamp) {
                totalMs +=
                  event.timestamp.toMillis() - pendingIn.timestamp.toMillis();
              }
              pendingIn = null;
            }
          }
          if (pendingIn?.timestamp) {
            totalMs += Date.now() - pendingIn.timestamp.toDate().getTime();
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

  const latestByEmployee = new Map<string, ClockEvent>();
  for (const event of events) {
    if (!latestByEmployee.has(event.employeeId)) {
      latestByEmployee.set(event.employeeId, event);
    }
  }

  const currentlyClockedIn = Array.from(latestByEmployee.values()).filter(
    (e) => e.type === "in"
  );
  const clockedInDisplay = currentlyClockedIn.slice(0, 8);
  const clockedInOverflow = currentlyClockedIn.length - clockedInDisplay.length;
  const totalClockedIn = currentlyClockedIn.length;

  const avgHoursWorked = (() => {
    if (currentlyClockedIn.length === 0) return "0h";
    const totalHours = currentlyClockedIn.reduce((sum, event) => {
      if (!event.timestamp) return sum;
      const elapsedMs = Date.now() - event.timestamp.toDate().getTime();
      return sum + elapsedMs / (1000 * 60 * 60);
    }, 0);
    return `${(totalHours / currentlyClockedIn.length).toFixed(1)}h`;
  })();

  const activeSiteCounts = new Map<string, number>();
  for (const event of currentlyClockedIn) {
    const key = event.siteName || "Not specified";
    activeSiteCounts.set(key, (activeSiteCounts.get(key) ?? 0) + 1);
  }
  const activeSites = Array.from(activeSiteCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  useEffect(() => {
    if (!userData?.companyId || !settings.attendanceRules.autoClockOut) return;

    const now = new Date();
    const stale = currentlyClockedIn.filter(
      (event) => event.timestamp && !isSameDay(event.timestamp.toDate(), now)
    );

    stale.forEach(async (event) => {
      if (autoClosedRef.current.has(event.id)) return;
      autoClosedRef.current.add(event.id);

      try {
        const clockInDate = event.timestamp!.toDate();
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
        await addDoc(eventsRef, {
          employeeId: event.employeeId,
          employeeName: event.employeeName,
          siteId: event.siteId,
          siteName: event.siteName,
          type: "out",
          source: "adminManual",
          note: "Auto clocked out (end of business hours) - enabled in Settings",
          timestamp: Timestamp.fromDate(closeTime),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Auto clock-out error:", err);
      }
    });
  }, [
    currentlyClockedIn,
    settings.attendanceRules.autoClockOut,
    settings.businessHours.close,
    userData?.companyId,
  ]);

  const alertItems: AlertItem[] = [];
  const now = new Date();

  if (settings.alerts.maxHoursWarning) {
    currentlyClockedIn
      .filter((event) => event.timestamp && isSameDay(event.timestamp.toDate(), now))
      .forEach((event) => {
        const elapsedHours =
          (Date.now() - event.timestamp!.toDate().getTime()) / (1000 * 60 * 60);
        if (elapsedHours >= MAX_SHIFT_HOURS) {
          alertItems.push({
            key: `max-${event.employeeId}`,
            label: event.employeeName,
            detail: `Clocked in for ${elapsedHours.toFixed(1)}h - check in?`,
          });
        }
      });
  }

  if (settings.alerts.missedClockOutAlert && !settings.attendanceRules.autoClockOut) {
    currentlyClockedIn
      .filter((event) => event.timestamp && !isSameDay(event.timestamp.toDate(), now))
      .forEach((event) => {
        alertItems.push({
          key: `missed-${event.employeeId}`,
          label: event.employeeName,
          detail: `Still clocked in from ${event.timestamp!.toDate().toLocaleDateString()} - missed clock-out.`,
        });
      });
  }

  if (settings.alerts.overtimeWarning) {
    for (const [employeeId, hours] of weeklyHoursByEmployee) {
      if (hours > settings.weeklyOvertimeThreshold) {
        const employee = employees.find((e) => e.id === employeeId);
        alertItems.push({
          key: `ot-${employeeId}`,
          label: employee?.name ?? "Unknown employee",
          detail: `${hours.toFixed(1)}h this week - over the ${settings.weeklyOvertimeThreshold}h threshold.`,
        });
      }
    }
  }

  if (settings.alerts.lowStaffingAlert) {
    const [openH, openM] = settings.businessHours.open.split(":").map(Number);
    const [closeH, closeM] = settings.businessHours.close.split(":").map(Number);
    const openToday = new Date(now);
    openToday.setHours(openH, openM, 0, 0);
    const closeToday = new Date(now);
    closeToday.setHours(closeH, closeM, 0, 0);

    if (now >= openToday && now <= closeToday && totalClockedIn === 0) {
      alertItems.push({
        key: "low-staffing",
        label: "No one is clocked in",
        detail: "It's currently within business hours.",
      });
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

      <div className="mt-8 grid gap-5 sm:grid-cols-3">
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
          value={totalClockedIn}
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
                const pct = totalClockedIn
                  ? Math.round((count / totalClockedIn) * 100)
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
        <div className="mt-5 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : alertItems.length === 0 ? (
            <p className="text-sm text-gray-600">No alerts right now.</p>
          ) : (
            alertItems.map((alert) => (
              <div
                key={alert.key}
                className="flex items-start gap-3 rounded-lg bg-amber-50 p-3.5"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-gray-950">
                    {alert.label}
                  </p>
                  <p className="text-xs text-gray-600">{alert.detail}</p>
                </div>
              </div>
            ))
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
        ) : currentlyClockedIn.length === 0 ? (
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
              {clockedInDisplay.map((event) => (
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
                    {event.timestamp ? timeAgo(event.timestamp.toDate()) : "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {clockedInOverflow > 0 && (
          <Link
            href="/dashboard/time"
            className="block border-t border-gray-200 px-6 py-3 text-center text-sm font-medium text-accent hover:underline"
          >
            +{clockedInOverflow} more
          </Link>
        )}
      </div>
    </div>
  );
}
