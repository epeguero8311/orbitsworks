import Link from "next/link";
import type { ClockEvent } from "@/lib/types";
import { effectiveDate, timeAgo } from "@/lib/dashboardOverviewUtils";

export default function OnBreakTable({
  loading,
  onBreakDisplay,
  onBreakOverflow,
}: {
  loading: boolean;
  onBreakDisplay: ClockEvent[];
  onBreakOverflow: number;
}) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-950">On break</h2>
        <Link
          href="/dashboard/time"
          className="text-sm font-medium text-accent hover:underline"
        >
          View all
        </Link>
      </div>

      {loading ? (
        <p className="p-6 text-sm text-gray-600">Loading...</p>
      ) : onBreakDisplay.length === 0 ? (
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
  );
}
