"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  doc,
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

const LONG_SHIFT_HOURS = 8;

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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}
        >
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600">{label}</p>
          <p className="text-xl font-semibold text-gray-950">
            {loading ? "—" : value}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardOverviewPage() {
  const { userData } = useAuth();
  const { employees, loading: loadingEmployees } = useEmployees();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyAttendance, setWeeklyAttendance] = useState<DayAttendance[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);

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

  const longShiftAlerts = currentlyClockedIn
    .filter((event) => {
      if (!event.timestamp) return false;
      const elapsedHours =
        (Date.now() - event.timestamp.toDate().getTime()) / (1000 * 60 * 60);
      return elapsedHours >= LONG_SHIFT_HOURS;
    })
    .map((event) => {
      const elapsedHours =
        (Date.now() - event.timestamp!.toDate().getTime()) / (1000 * 60 * 60);
      return { ...event, elapsedHours };
    })
    .sort((a, b) => b.elapsedHours - a.elapsedHours);

  const activeSiteCounts = new Map<string, number>();
  for (const event of currentlyClockedIn) {
    const key = event.siteName || "Not specified";
    activeSiteCounts.set(key, (activeSiteCounts.get(key) ?? 0) + 1);
  }
  const activeSites = Array.from(activeSiteCounts.entries());

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-950">
            Welcome, {companyName ?? "…"}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Here&apos;s what&apos;s happening across your job sites today.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/reports"
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:border-gray-300"
          >
            <Download className="h-4 w-4" />
            Download Report
          </Link>
          <Link
            href="/dashboard/employees"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <UserPlus className="h-4 w-4" />
            Add Employee
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
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

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-950">
            Weekly attendance
          </h2>
          <p className="mt-1 text-xs text-gray-600">
            Unique employees clocked in each day, last 7 days.
          </p>
          <div className="mt-4 h-52">
            {loadingChart ? (
              <p className="text-sm text-gray-600">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyAttendance}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    axisLine={{ stroke: "#e5e7eb" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                  />
                  <Tooltip
                    cursor={{ fill: "#fafafa" }}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                    }}
                  />
                  <Bar dataKey="count" fill="#3b6fe0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-950">Alerts</h2>
          <p className="mt-1 text-xs text-gray-600">
            Anything that needs your attention.
          </p>
          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-gray-600">Loading…</p>
            ) : longShiftAlerts.length === 0 ? (
              <p className="text-sm text-gray-600">No alerts right now.</p>
            ) : (
              longShiftAlerts.map((alert) => (
                <div
                  key={alert.employeeId}
                  className="flex items-start gap-2 rounded-md bg-amber-50 p-2.5"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-950">
                      {alert.employeeName}
                    </p>
                    <p className="text-xs text-gray-600">
                      Clocked in for {alert.elapsedHours.toFixed(1)}h — check
                      in?
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-950">
            Employees clocked in
          </h2>
          <Link
            href="/dashboard/time"
            className="text-xs font-medium text-accent hover:underline"
          >
            View all
          </Link>
        </div>

        {loading ? (
          <p className="p-4 text-sm text-gray-600">Loading…</p>
        ) : currentlyClockedIn.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No one is currently clocked in.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Job site</th>
                <th className="px-4 py-2 font-medium">Since</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {clockedInDisplay.map((event) => (
                <tr
                  key={event.employeeId}
                  className="border-b border-gray-200 last:border-0"
                >
                  <td className="px-4 py-2.5 text-gray-950">
                    {event.employeeName}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {event.siteName}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {event.timestamp ? timeAgo(event.timestamp.toDate()) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
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
            className="block border-t border-gray-200 px-4 py-2.5 text-center text-sm font-medium text-accent hover:underline"
          >
            +{clockedInOverflow} more
          </Link>
        )}
      </div>
    </div>
  );
}