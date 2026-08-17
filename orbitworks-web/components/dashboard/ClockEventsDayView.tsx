"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useClockEventsByDay } from "@/lib/hooks/useClockEventsByDay";
import { ClockEvent } from "@/lib/types";
import { dateKey } from "@/lib/reportUtils";
import ClockEventDetailModal from "@/components/dashboard/ClockEventDetailModal";

function sourceLabel(source: ClockEvent["source"]) {
  switch (source) {
    case "faceMatch":
      return { text: "Face match", className: "bg-green-50 text-green-700" };
    case "pin":
      return { text: "PIN", className: "bg-purple-50 text-purple-700" };
    case "supervisorOverride":
      return {
        text: "Supervisor override",
        className: "bg-amber-50 text-amber-700",
      };
    case "adminManual":
      return { text: "Admin manual", className: "bg-blue-50 text-blue-700" };
    case "autoClockOut":
      return {
        text: "Auto clock-out",
        className: "bg-orange-50 text-orange-700",
      };
    default:
      return { text: "Unknown", className: "bg-gray-50 text-gray-600" };
  }
}

export default function ClockEventsDayView({
  companyId,
}: {
  companyId: string | undefined;
}) {
  const todayKey = dateKey(new Date());
  const [currentDate, setCurrentDate] = useState(todayKey);
  const [selectedEvent, setSelectedEvent] = useState<ClockEvent | null>(null);
  const { events, loading, error } = useClockEventsByDay(
    companyId,
    currentDate
  );

  const isToday = currentDate === todayKey;

  function shiftDate(deltaDays: number) {
    const d = new Date(currentDate + "T00:00:00");
    d.setDate(d.getDate() + deltaDays);
    const next = dateKey(d);
    if (next > todayKey) return;
    setCurrentDate(next);
  }

  const dateLabel = new Date(currentDate + "T00:00:00").toLocaleDateString(
    "en-US",
    { weekday: "short", month: "short", day: "numeric", year: "numeric" }
  );

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-950">Clock events</h2>

        <div className="flex items-center gap-2">
          {!isToday && (
            <button
              type="button"
              onClick={() => setCurrentDate(todayKey)}
              className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
            >
              Today
            </button>
          )}

          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:border-gray-300"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="w-36 text-center text-sm font-medium text-gray-950">
            {dateLabel}
          </span>

          <button
            type="button"
            onClick={() => shiftDate(1)}
            disabled={isToday}
            className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <label className="relative flex cursor-pointer items-center rounded-md border border-gray-200 p-1.5 text-gray-600 hover:border-gray-300">
            <Calendar className="h-4 w-4" />
            <input
              type="date"
              value={currentDate}
              max={todayKey}
              onChange={(e) => e.target.value && setCurrentDate(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Jump to date"
            />
          </label>
        </div>
      </div>

      {error ? (
        <p className="p-4 text-sm text-red-600">{error}</p>
      ) : loading ? (
        <p className="p-4 text-sm text-gray-600">Loading...</p>
      ) : events.length === 0 ? (
        <p className="p-4 text-sm text-gray-600">
          No clock events on {dateLabel}.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-600">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Site</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Photo</th>
              <th className="px-4 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const badge = sourceLabel(event.source);
              return (
                <tr
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className="cursor-pointer border-b border-gray-200 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-2.5 text-gray-950">
                    {event.employeeName}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {event.siteName}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`font-medium ${
                        event.type === "in"
                          ? "text-green-700"
                          : "text-gray-600"
                      }`}
                    >
                      {event.type === "in" ? "Clock in" : "Clock out"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                    {event.timestamp
                      ? event.timestamp.toDate().toLocaleString()
                      : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.text}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {event.photoUrl ? "View" : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {event.note || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selectedEvent && (
        <ClockEventDetailModal
          event={selectedEvent}
          allEvents={events}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}