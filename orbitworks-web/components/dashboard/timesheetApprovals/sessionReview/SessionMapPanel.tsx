"use client";

import { useState } from "react";
import type { ClockEvent } from "@/lib/types";
import { EventLocation } from "@/components/time/EventLocation";

// Map for one event at a time, with a Clock in | Clock out toggle styled
// like the page's Day | Week toggle (ApprovalsHeader). EventLocation is the
// same map/address/on-site/accuracy/Google Maps block Time Tracking uses.
export function SessionMapPanel({ clockIn, clockOut }: { clockIn: ClockEvent; clockOut: ClockEvent }) {
  const [tab, setTab] = useState<"in" | "out">("in");
  const event = tab === "in" ? clockIn : clockOut;
  const btn = (active: boolean) =>
    `rounded px-3 py-1 text-sm font-medium ${active ? "bg-accent text-white" : "text-gray-600 hover:bg-gray-100"}`;

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Map</p>
        <div className="flex rounded-md border border-gray-200 p-0.5">
          <button type="button" onClick={() => setTab("in")} className={btn(tab === "in")}>
            Clock in
          </button>
          <button type="button" onClick={() => setTab("out")} className={btn(tab === "out")}>
            Clock out
          </button>
        </div>
      </div>
      <EventLocation key={event.id} event={event} emptyText="No location captured" />
    </div>
  );
}
