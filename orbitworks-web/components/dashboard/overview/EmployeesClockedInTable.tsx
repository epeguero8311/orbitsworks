import Link from "next/link";
import type { ClockEvent } from "@/lib/types";
import { deriveStatus } from "@/lib/clockStatus";
import { formatDuration } from "@/lib/dashboardOverviewUtils";

export default function EmployeesClockedInTable({
  loading,
  activeDisplay,
  activeOverflow,
  workedMsByEmployee,
}: {
  loading: boolean;
  activeDisplay: ClockEvent[];
  activeOverflow: number;
  workedMsByEmployee: Map<string, number>;
}) {
  return (
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
      ) : activeDisplay.length === 0 ? (
        <p className="p-6 text-sm text-gray-600">
          No one is currently clocked in.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-600">
            <tr>
              <th className="px-6 py-3 font-medium">Employee</th>
              <th className="px-6 py-3 font-medium">Job site</th>
              <th className="px-6 py-3 font-medium">Worked</th>
              <th className="px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {activeDisplay.map((event) => {
              const isOnBreak = deriveStatus(event.type) === "break";
              const workedMs = workedMsByEmployee.get(event.employeeId) ?? 0;
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
                    {formatDuration(workedMs)}
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
  );
}
