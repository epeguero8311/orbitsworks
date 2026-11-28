"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, SlidersHorizontal } from "lucide-react";
import {
  CLOCK_EVENTS_PAGE,
  EMPTY_CLOCK_EVENT_FILTERS,
  activeFilterCount,
  filterClockEvents,
  type ClockEventFilters,
} from "@/lib/clockEventFilters";
import { ClockEventsFilterPanel } from "@/components/dashboard/time/ClockEventsFilterPanel";
import { useClockEventsByDay } from "@/lib/hooks/useClockEventsByDay";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useSites } from "@/lib/hooks/useSites";
import { UNASSIGNED_SITE } from "@/lib/adminAccess";
import { useShiftCommentsByClockIn } from "@/lib/hooks/useShiftCommentsByClockIn";
import { useSiteExitsByClockIn } from "@/lib/hooks/useSiteExitsByClockIn";
import { clockInIds, commentsForEvent } from "@/lib/shiftComments";
import { ClockEvent } from "@/lib/types";
import { typeLabel, sourceLabel, isBreakEvent } from "@/lib/clockStatus";
import { dateKey } from "@/lib/reportUtils";
import ClockEventDetailModal from "@/components/dashboard/ClockEventDetailModal";
import { GeofenceBadge } from "@/components/time/GeofenceBadge";
import { FaceCheckBadge } from "@/components/time/FaceCheckBadge";
import { PhotoStatusCell } from "@/components/time/PhotoStatusCell";
import { AutoDetectedTag } from "@/components/time/AutoDetectedTag";
import { SyncedLateTag } from "@/components/time/SyncedLateTag";
import { EventNoteCell } from "@/components/time/ShiftCommentsNote";

function latestAdjustment(event: ClockEvent) {
  if (!event.adjustmentHistory || event.adjustmentHistory.length === 0) {
    return null;
  }
  return event.adjustmentHistory[event.adjustmentHistory.length - 1];
}

export default function ClockEventsDayView({
  companyId,
}: {
  companyId: string | undefined;
}) {
  const todayKey = dateKey(new Date());
  const [currentDate, setCurrentDate] = useState(todayKey);
  const [selectedEvent, setSelectedEvent] = useState<ClockEvent | null>(null);
  const [filters, setFilters] = useState<ClockEventFilters>(EMPTY_CLOCK_EVENT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Show 20 rows, +20 per "Show more". Back to 20 whenever the day or the
  // filters change (reset during render - no setState in an effect).
  const [visibleCount, setVisibleCount] = useState(CLOCK_EVENTS_PAGE);
  const pageKey = currentDate + "|" + JSON.stringify(filters);
  const [seenPageKey, setSeenPageKey] = useState(pageKey);
  if (pageKey !== seenPageKey) {
    setSeenPageKey(pageKey);
    setVisibleCount(CLOCK_EVENTS_PAGE);
  }
  // Phase 9 (H10 a): pairingEvents also holds the day before and after, so
  // a shift crossing midnight pairs in the detail window.
  const { events: allEvents, pairingEvents, loading, error } = useClockEventsByDay(companyId, currentDate);
  const { isPro } = useCompanySettings();
  // Bug 11/26: an Admin limited to some job sites only sees shifts on those
  // sites here (rule 1) - while Overview shows every site (D13). Say so, so
  // an empty day never looks like lost punches.
  const { serverReads, access } = useAdminAccess();
  const { sites } = useSites();
  const scopeNames =
    serverReads && Array.isArray(access.sites)
      ? access.sites.map((id) => (id === UNASSIGNED_SITE ? "Unassigned shifts" : sites.find((s) => s.id === id)?.name ?? "a removed site"))
      : [];
  // Employee comments shown in each clock-in row's Note cell.
  const { commentsByClockIn, error: commentsError } = useShiftCommentsByClockIn(companyId, clockInIds(allEvents));
  // Phase 8: "Left the job site" lines in the same cell (clock-in rows).
  const { exitsByClockIn, error: exitsError } = useSiteExitsByClockIn(companyId, clockInIds(allEvents));
  const events = filterClockEvents(allEvents, filters, isPro);
  const filterCount = activeFilterCount(filters, isPro);
  const shownEvents = events.slice(0, visibleCount);
  // Site choices: the company's sites plus any site name on this day's
  // events (a removed site still shows on old punches).
  const siteOptions = (() => {
    const map = new Map<string, string>();
    for (const s of sites) map.set(s.id, s.name);
    for (const e of allEvents) if (e.siteId && !map.has(e.siteId)) map.set(e.siteId, e.siteName || "Removed site");
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const isToday = currentDate === todayKey;
  const isPairable = (t: ClockEvent["type"]) => t === "in" || t === "out";

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
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-950">Clock events</h2>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:border-gray-300 ${
              filterCount > 0 ? "border-accent text-accent" : "border-gray-200 text-gray-600"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filter{filterCount > 0 ? ` (${filterCount})` : ""}
          </button>
        </div>

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

      {filtersOpen && (
        <ClockEventsFilterPanel filters={filters} onChange={setFilters} siteOptions={siteOptions} isPro={isPro} />
      )}

      {serverReads && (
        <p className="border-b border-gray-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {scopeNames.length
            ? `Showing only shifts on your job sites: ${scopeNames.join(", ")}. Shifts on other sites are hidden here (Overview shows every site).`
            : "You don't have any job sites yet, so no shifts are shown here. Ask the owner to give you sites."}
        </p>
      )}
      {commentsError && <p className="border-b border-gray-200 px-4 py-2 text-xs text-red-600">{commentsError}</p>}
      {exitsError && <p className="border-b border-gray-200 px-4 py-2 text-xs text-red-600">{exitsError}</p>}

      {error ? (
        <p className="p-4 text-sm text-red-600">{error}</p>
      ) : loading ? (
        <p className="p-4 text-sm text-gray-600">Loading...</p>
      ) : events.length === 0 ? (
        <p className="p-4 text-sm text-gray-600">
          {filterCount > 0
            ? `No clock events on ${dateLabel} match these filters.`
            : `No clock events on ${dateLabel}.`}
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
              <th className="px-4 py-2 font-medium">Authorized by</th>
              <th className="px-4 py-2 font-medium">Photo</th>
              <th className="px-4 py-2 font-medium">Note</th>
              <th className="px-4 py-2 font-medium">Geofence</th>
              <th className="px-4 py-2 font-medium">Face check</th>
            </tr>
          </thead>
          <tbody>
            {shownEvents.map((event) => {
              const badge = sourceLabel(event.source);
              const typeBadge = typeLabel(event.type);
              const pairable = isPairable(event.type);
              const isAdjusted = !!event.adjustedTimestamp;
              const adj = isAdjusted ? latestAdjustment(event) : null;
              const displayTime = event.adjustedTimestamp ?? event.timestamp;
              return (
                <tr
                  key={event.id}
                  onClick={() => pairable && setSelectedEvent(event)}
                  className={`border-b border-gray-200 last:border-0 ${
                    pairable ? "cursor-pointer hover:bg-gray-50" : ""
                  }`}
                >
                  <td className="px-4 py-2.5 text-gray-950">
                    {event.employeeName}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {isBreakEvent(event.type) ? (
                      "-"
                    ) : (
                      <>
                        {event.siteName}
                        <AutoDetectedTag event={event} />
                        <SyncedLateTag event={event} />
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`font-medium ${typeBadge.className}`}>
                      {typeBadge.text}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                    {displayTime ? displayTime.toDate().toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    {isAdjusted ? (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Adjusted
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.text}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {isAdjusted
                      ? adj?.changedByName ?? "Admin"
                      : event.authorizedByName ||
                        (event.deviceNameSnapshot
                          ? `${event.deviceNameSnapshot} (device)`
                          : "-")}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    <PhotoStatusCell event={event} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    <EventNoteCell event={event} comments={commentsForEvent(commentsByClockIn, event)} exits={event.type === "in" ? exitsByClockIn.get(event.id) ?? [] : []} />
                  </td>
                  <td className="px-4 py-2.5">
                    <GeofenceBadge event={event} />
                  </td>
                  <td className="px-4 py-2.5">
                    <FaceCheckBadge event={event} isPro={isPro} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!error && !loading && events.length > 0 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 text-xs text-gray-600">
          <span>
            Showing {shownEvents.length} of {events.length}
          </span>
          {shownEvents.length < events.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + CLOCK_EVENTS_PAGE)}
              className="rounded-md border border-gray-200 px-3 py-1.5 font-medium text-gray-950 hover:border-gray-300"
            >
              Show {Math.min(CLOCK_EVENTS_PAGE, events.length - shownEvents.length)} more
            </button>
          )}
        </div>
      )}

      {selectedEvent && (
        <ClockEventDetailModal
          event={selectedEvent}
          allEvents={pairingEvents}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}