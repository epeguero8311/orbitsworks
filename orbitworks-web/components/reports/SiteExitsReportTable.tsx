"use client";

import type { SiteExit } from "@/lib/types";
import { exitMinutes, siteExitLine, siteExitTone } from "@/lib/siteExits";

// Phase 9 (H7 a): every job site stretch in the report range - left the
// job site (red), on a break / short / tracking off (gray). Same lines as
// Time Tracking (lib/siteExits.ts). A flag only: no hours change.
function time(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function SiteExitsReportTable({ exits }: { exits: SiteExit[] }) {
  const sorted = [...exits].sort((a, b) => a.startMs - b.startMs);
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-950">Job site exits</h2>
        <p className="mt-1 text-sm text-gray-600">
          From the employee app while clocked in. Red = left the job site; gray = on a break, back within 3 minutes, or tracking off.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="p-6 text-sm text-gray-600">No job site exits for this date range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Employee</th>
                <th className="px-6 py-3 font-medium">Site</th>
                <th className="px-6 py-3 font-medium">What</th>
                <th className="px-6 py-3 font-medium">Minutes</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((x) => {
                const red = siteExitTone(x) === "red";
                return (
                  <tr key={x.id} className="border-b border-gray-200 last:border-0">
                    <td className="px-6 py-3 text-gray-600">{new Date(x.startMs).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                    <td className="px-6 py-3 text-gray-950">{x.employeeName}</td>
                    <td className="px-6 py-3 text-gray-600">{x.siteName}</td>
                    <td className={`px-6 py-3 ${red ? "font-medium text-red-700" : "text-gray-500"}`}>{siteExitLine(x, time)}</td>
                    <td className="px-6 py-3 text-gray-600">{x.endMs === null ? "-" : exitMinutes(x, x.endMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
