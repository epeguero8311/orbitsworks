"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

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

export default function DashboardOverviewPage() {
  const { userData } = useAuth();
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;
    const eventsRef = collection(
      db,
      "companies",
      userData.companyId,
      "clockEvents"
    );
    // Pull a decently large recent window — enough to find each employee's
    // latest event without querying every employee individually.
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

  // Latest event per employee, in order of most-recently-seen employee first
  const latestByEmployee = new Map<string, ClockEvent>();
  for (const event of events) {
    if (!latestByEmployee.has(event.employeeId)) {
      latestByEmployee.set(event.employeeId, event);
    }
  }

  const currentlyClockedIn = Array.from(latestByEmployee.values()).filter(
    (e) => e.type === "in"
  );

  const recentActivity = events.slice(0, 10);

  // Widget: last 8 distinct employees seen in activity, regardless of in/out
  const recentEmployees: ClockEvent[] = [];
  const seenEmployeeIds = new Set<string>();
  for (const event of events) {
    if (seenEmployeeIds.has(event.employeeId)) continue;
    seenEmployeeIds.add(event.employeeId);
    recentEmployees.push(event);
    if (recentEmployees.length >= 8) break;
  }

  // Widget: job sites with at least one person currently clocked in, with headcount
  const activeSiteCounts = new Map<string, number>();
  for (const event of currentlyClockedIn) {
    const key = event.siteName || "Not specified";
    activeSiteCounts.set(key, (activeSiteCounts.get(key) ?? 0) + 1);
  }
  const activeSites = Array.from(activeSiteCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Overview</h1>
      <p className="mt-1 text-sm text-gray-600">
        Who&apos;s clocked in right now, across all job sites.
      </p>

      {/* Widgets: recently active employees + active job sites */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/employees"
          className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
        >
          <h2 className="text-sm font-semibold text-gray-950">
            Recently active employees
          </h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Loading…</p>
          ) : recentEmployees.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">No activity yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentEmployees.map((event) => (
                <li
                  key={event.employeeId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-950">{event.employeeName}</span>
                  <span
                    className={`text-xs font-medium ${
                      event.type === "in" ? "text-green-700" : "text-gray-600"
                    }`}
                  >
                    {event.type === "in" ? "Clocked in" : "Clocked out"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Link>

        <Link
          href="/dashboard/sites"
          className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
        >
          <h2 className="text-sm font-semibold text-gray-950">
            Active job sites
          </h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-600">Loading…</p>
          ) : activeSites.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              No sites currently staffed.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {activeSites.map(([siteName, count]) => (
                <li
                  key={siteName}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-950">{siteName}</span>
                  <span className="text-xs font-medium text-gray-600">
                    {count} {count === 1 ? "person" : "people"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Link>
      </div>

      {/* Currently clocked in */}
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-950">
            Currently clocked in
            {!loading && (
              <span className="ml-2 font-normal text-gray-600">
                ({currentlyClockedIn.length})
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <p className="p-4 text-sm text-gray-600">Loading…</p>
        ) : currentlyClockedIn.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No one is currently clocked in.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {currentlyClockedIn.map((event) => (
              <li
                key={event.employeeId}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-950">
                      {event.employeeName}
                    </p>
                    <p className="text-xs text-gray-600">{event.siteName}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-600">
                  {event.timestamp
                    ? `since ${timeAgo(event.timestamp.toDate())}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent activity feed */}
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-950">
            Recent activity
          </h2>
        </div>

        {loading ? (
          <p className="p-4 text-sm text-gray-600">Loading…</p>
        ) : recentActivity.length === 0 ? (
          <p className="p-4 text-sm text-gray-600">
            No activity yet. Once employees clock in and out, it&apos;ll show
            up here.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {recentActivity.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="text-gray-950">
                  <span className="font-medium">{event.employeeName}</span>{" "}
                  <span
                    className={
                      event.type === "in" ? "text-green-700" : "text-gray-600"
                    }
                  >
                    clocked {event.type === "in" ? "in" : "out"}
                  </span>{" "}
                  <span className="text-gray-600">at {event.siteName}</span>
                </span>
                <span className="whitespace-nowrap font-mono text-xs text-gray-600">
                  {event.timestamp
                    ? event.timestamp.toDate().toLocaleString()
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}