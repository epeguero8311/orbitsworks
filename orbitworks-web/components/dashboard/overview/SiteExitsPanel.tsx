"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useSiteExitsByRange } from "@/lib/hooks/useSiteExitsByRange";
import { siteExitLine, siteExitTone, splitOverviewExits, todayByPerson } from "@/lib/siteExits";

// Phase 9 (H8 a): the Overview "Left the job site" card - who is outside a
// geofenced job site right now (red, live - J3 a: also someone outside
// since yesterday, e.g. a night shift) and today's stretches per person
// (latest 3, "+N more"). From the employee app while clocked in. A flag
// only. Renders nothing when there is nothing to show (and on Core, which
// never has any).
function time(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Yesterday 00:00 to today 23:59 (browser day, like the rest of the site).
function loadRange(): { startMs: number; todayStartMs: number; endMs: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  return { startMs: yesterday.getTime(), todayStartMs: today.getTime(), endMs: end.getTime() };
}

export default function SiteExitsPanel() {
  const { userData } = useAuth();
  // Fixed for this page view (a reload picks up a new day).
  const [range] = useState(loadRange);
  const { exits, error } = useSiteExitsByRange(userData?.companyId, range.startMs, range.endMs);
  const { outside: now, today } = splitOverviewExits(exits, range.todayStartMs);
  if (now.length === 0 && today.length === 0 && !error) return null;
  const people = todayByPerson(today);

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
