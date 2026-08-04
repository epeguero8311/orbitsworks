"use client";

import type { AttendanceStats } from "@/lib/types";
import { formatMinutesAsTime } from "@/lib/reportUtils";

export default function AttendanceCards({
  attendance,
}: {
  attendance: AttendanceStats | null;
}) {
  const cards = [
    {
      label: "On-time %",
      value: attendance ? `${attendance.onTimePercent.toFixed(0)}%` : "-",
    },
    {
      label: "Late %",
      value: attendance ? `${attendance.latePercent.toFixed(0)}%` : "-",
    },
    {
      label: "Avg. arrival time",
      value: attendance ? formatMinutesAsTime(attendance.avgArrivalMinutes) : "-",
    },
    {
      label: "Avg. departure time",
      value: attendance ? formatMinutesAsTime(attendance.avgDepartureMinutes) : "-",
    },
  ];

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-950">Attendance</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-600">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-950">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
