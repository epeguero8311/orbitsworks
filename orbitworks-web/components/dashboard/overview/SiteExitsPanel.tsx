"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useSiteExitsByRange } from "@/lib/hooks/useSiteExitsByRange";
import { outsideNow, siteExitLine, siteExitTone, todayByPerson } from "@/lib/siteExits";

// Phase 9 (H8 a): the Overview "Left the job site" card - who is outside a
// geofenced job site right now (red, live) and today's stretches per person
// (latest 3, "+N more"). From the employee app while clocked in. A flag
// only. Renders nothing on a day with none (and on Core, which never has
// any).
function time(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function todayRange(): { startMs: number; endMs: number } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export default function SiteExitsPanel() {
  const { userData } = useAuth();
  // Today's bounds, fixed for this page view (a reload picks up a new day).
  const [range] = useState(todayRange);
  const { exits, error } = useSiteExitsByRange(userData?.companyId, range.startMs, range.endMs);
  if (exits.length === 0 && !error) return null;
  const now = outsideNow(exits);
  const people = todayByPerson(exits);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-950">Left the job site</h2>
        <p className="mt-1 text-sm text-gray-600">Today, from the employee app. A flag only - nobody is clocked out.</p>
      </div>
      {error && <p className="px-6 py-3 text-sm text-red-600">{error}</p>}
      {now.length > 0 && (
        <div className="border-b border-gray-200 px-6 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-red-700">Outside now</p>
          <ul className="mt-1 space-y-1">
            {now.map((x) => (
              <li key={x.id} className="text-sm text-red-700">
                <span className="font-medium">{x.employeeName}</span> - left {x.siteName} at {time(x.startMs)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="divide-y divide-gray-200">
        {people.map((p) => (
          <li key={p.employeeId} className="px-6 py-3">
            <p className="text-sm font-medium text-gray-950">{p.employeeName}</p>
            <ul className="mt-1 space-y-0.5">
              {p.shown.map((x) => (
                <li key={x.id} className={siteExitTone(x) === "red" ? "text-xs font-medium text-red-700" : "text-xs text-gray-500"}>
                  {siteExitLine(x, time)}
                </li>
              ))}
            </ul>
            {p.more > 0 && <p className="mt-1 text-xs text-gray-500">+{p.more} more today - see Time Tracking</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
