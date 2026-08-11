"use client";

import { useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

type ClockEvent = {
  id: string;
  employeeId: string;
  employeeName: string;
  siteName: string;
  type: "in" | "out";
  timestamp: Timestamp;
};

type EmployeeSummary = {
  employeeId: string;
  employeeName: string;
  totalHours: number;
  sessionCount: number;
  openSessions: number; // clock-ins with no matching clock-out
};

function formatHours(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

function toCsv(summaries: EmployeeSummary[], startDate: string, endDate: string) {
  const header = [
    "Employee",
    "Total Hours (decimal)",
    "Total Hours (h:m)",
    "Completed Sessions",
    "Missing Clock-Outs",
  ];
  const rows = summaries.map((s) => [
    s.employeeName,
    s.totalHours.toFixed(2),
    formatHours(s.totalHours),
    String(s.sessionCount),
    String(s.openSessions),
  ]);

  const csvLines = [
    `Report period: ${startDate} to ${endDate}`,
    header.join(","),
    ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
  ];

  return csvLines.join("\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { userData } = useAuth();

  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(twoWeeksAgo);
  const [endDate, setEndDate] = useState(today);
  const [summaries, setSummaries] = useState<EmployeeSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runReport() {
    if (!userData?.companyId) return;
    setError("");
    setLoading(true);
    setSummaries(null);

    try {
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T23:59:59");

      const eventsRef = collection(
        db,
        "companies",
        userData.companyId,
        "clockEvents"
      );
      const q = query(
        eventsRef,
        where("timestamp", ">=", Timestamp.fromDate(start)),
        where("timestamp", "<=", Timestamp.fromDate(end)),
        orderBy("timestamp", "asc")
      );

      const snapshot = await getDocs(q);
      const events = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ClockEvent, "id">),
      }));

      // Group events by employee, preserving chronological order
      const byEmployee = new Map<string, ClockEvent[]>();
      for (const event of events) {
        const list = byEmployee.get(event.employeeId) ?? [];
        list.push(event);
        byEmployee.set(event.employeeId, list);
      }

      const results: EmployeeSummary[] = [];

      for (const [employeeId, employeeEvents] of byEmployee) {
        let totalMs = 0;
        let sessionCount = 0;
        let openSessions = 0;
        let pendingIn: ClockEvent | null = null;

        for (const event of employeeEvents) {
          if (event.type === "in") {
            // If there's already a pending "in" with no "out", it's an open session
            if (pendingIn) openSessions += 1;
            pendingIn = event;
          } else if (event.type === "out" && pendingIn) {
            const durationMs =
              event.timestamp.toMillis() - pendingIn.timestamp.toMillis();
            if (durationMs > 0) {
              totalMs += durationMs;
              sessionCount += 1;
            }
            pendingIn = null;
          }
        }
        if (pendingIn) openSessions += 1;

        results.push({
          employeeId,
          employeeName: employeeEvents[0].employeeName,
          totalHours: totalMs / (1000 * 60 * 60),
          sessionCount,
          openSessions,
        });
      }

      results.sort((a, b) => b.totalHours - a.totalHours);
      setSummaries(results);
    } catch (err) {
      console.error("Report generation error:", err);
      setError("Couldn't generate the report. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleExport() {
    if (!summaries) return;
    const csv = toCsv(summaries, startDate, endDate);
    downloadCsv(csv, `orbitworks-hours_${startDate}_to_${endDate}.csv`);
  }

  const totalHoursAll = summaries?.reduce((sum, s) => sum + s.totalHours, 0) ?? 0;
  const totalOpenSessions =
    summaries?.reduce((sum, s) => sum + s.openSessions, 0) ?? 0;

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-950">Reports</h1>
      <p className="mt-1 text-sm text-gray-600">
        Calculate hours worked over a date range and export to CSV.
      </p>

      {/* Date range picker */}
      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end">
        <div>
          <label
            htmlFor="startDate"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            Start date
          </label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label
            htmlFor="endDate"
            className="mb-1.5 block text-sm font-medium text-gray-950"
          >
            End date
          </label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <button
          onClick={runReport}
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {loading ? "Calculating…" : "Run report"}
        </button>
        {summaries && (
          <button
            onClick={handleExport}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:border-gray-300"
          >
            Export CSV
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Results */}
      {summaries && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-600">
                Total hours ({startDate} to {endDate})
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-950">
                {formatHours(totalHoursAll)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium text-gray-600">
                Missing clock-outs
              </p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  totalOpenSessions > 0 ? "text-amber-600" : "text-gray-950"
                }`}
              >
                {totalOpenSessions}
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {summaries.length === 0 ? (
              <p className="p-4 text-sm text-gray-600">
                No clock events in this date range.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Total hours</th>
                    <th className="px-4 py-2 font-medium">Sessions</th>
                    <th className="px-4 py-2 font-medium">Missing clock-out</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((s) => (
                    <tr
                      key={s.employeeId}
                      className="border-b border-gray-200 last:border-0"
                    >
                      <td className="px-4 py-2.5 text-gray-950">
                        {s.employeeName}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-gray-950">
                        {formatHours(s.totalHours)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {s.sessionCount}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.openSessions > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            {s.openSessions} open
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}