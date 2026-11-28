"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import {
  EMPTY_CLOCK_EVENT_FILTERS,
  type ClockEventFilters,
  type FaceFilter,
  type GeofenceFilter,
} from "@/lib/clockEventFilters";

// Time Tracking -> Clock events -> Filter. Opens under the card header.
// Geofence and Face check are Pro: on Core they show faded with a lock
// and a Billing link, same idea as the locked Face check badge.

const TYPE_OPTIONS: [string, string][] = [
  ["in", "Clock in"],
  ["out", "Clock out"],
  ["breakStart", "Start break"],
  ["breakEnd", "End break"],
];

const SOURCE_OPTIONS: [string, string][] = [
  ["faceMatch", "Face match"],
  ["pin", "PIN"],
  ["supervisorOverride", "Supervisor override"],
  ["supervisorPin", "Supervisor PIN"],
  ["adminManual", "Admin manual"],
  ["employeeApp", "Employee app"],
  ["kiosk", "Kiosk"],
  ["tempLink", "Temp link"],
  ["autoClockOut", "Auto clock-out"],
  ["autoBreakEnd", "Auto break end"],
  ["employeeDeactivated", "Auto clock-out (deactivated)"],
  ["adjusted", "Adjusted"],
];

const selectClass =
  "w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-950 focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400";

function Field({ label, locked, children }: { label: string; locked?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${locked ? "opacity-60" : ""}`}>
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
        {locked && <Lock className="h-3 w-3" aria-hidden />}
        {label}
      </span>
      {children}
    </label>
  );
}

export function ClockEventsFilterPanel({
  filters,
  onChange,
  siteOptions,
  isPro,
}: {
  filters: ClockEventFilters;
  onChange: (next: ClockEventFilters) => void;
  siteOptions: { id: string; name: string }[];
  isPro: boolean;
}) {
  const set = (patch: Partial<ClockEventFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Field label="Site">
          <select className={selectClass} value={filters.siteId} onChange={(e) => set({ siteId: e.target.value })}>
            <option value="">All sites</option>
            {siteOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select className={selectClass} value={filters.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="">All types</option>
            {TYPE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Time range">
          <div className="flex items-center gap-1">
            <input
              type="time"
              aria-label="From time"
              value={filters.timeFrom}
              onChange={(e) => set({ timeFrom: e.target.value })}
              className={selectClass}
            />
            <span className="text-xs text-gray-500">to</span>
            <input
              type="time"
              aria-label="To time"
              value={filters.timeTo}
              onChange={(e) => set({ timeTo: e.target.value })}
              className={selectClass}
            />
          </div>
        </Field>
        <Field label="Source">
          <select className={selectClass} value={filters.source} onChange={(e) => set({ source: e.target.value })}>
            <option value="">All sources</option>
            {SOURCE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Geofence" locked={!isPro}>
          <select
            className={selectClass}
            disabled={!isPro}
            value={isPro ? filters.geofence : "any"}
            onChange={(e) => set({ geofence: e.target.value as GeofenceFilter })}
          >
            <option value="any">Any</option>
            <option value="inside">At site (in)</option>
            <option value="outside">Outside geofence (out)</option>
          </select>
        </Field>
        <Field label="Face check" locked={!isPro}>
          <select
            className={selectClass}
            disabled={!isPro}
            value={isPro ? filters.face : "any"}
            onChange={(e) => set({ face: e.target.value as FaceFilter })}
          >
            <option value="any">Any</option>
            <option value="notChecked">Not checked</option>
            <option value="match">Match</option>
            <option value="mismatch">No match</option>
            <option value="noFace">No face</option>
          </select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {!isPro ? (
          <p className="flex items-center gap-1 text-xs text-gray-600">
            <Lock className="h-3 w-3" aria-hidden />
            Geofence and Face check filters are Pro features.{" "}
            <Link href="/dashboard/billing" className="font-medium text-accent hover:underline">
              Go to Billing
            </Link>
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => onChange(EMPTY_CLOCK_EVENT_FILTERS)}
          className="text-xs font-medium text-gray-600 hover:text-gray-950"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
