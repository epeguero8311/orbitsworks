"use client";

import { ClockEvent } from "@/lib/types";

type Props = {
  event: ClockEvent;
  allEvents: ClockEvent[];
  onClose: () => void;
};

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function findPairedEvent(
  event: ClockEvent,
  allEvents: ClockEvent[]
): ClockEvent | null {
  if (!event.timestamp) return null;
  const clickedDate = event.timestamp.toDate();
  const wantType = event.type === "in" ? "out" : "in";

  const candidates = allEvents.filter(
    (e) =>
      e.id !== event.id &&
      e.employeeId === event.employeeId &&
      e.type === wantType &&
      e.timestamp &&
      isSameCalendarDay(e.timestamp.toDate(), clickedDate)
  );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const diffA = Math.abs(
      a.timestamp!.toDate().getTime() - clickedDate.getTime()
    );
    const diffB = Math.abs(
      b.timestamp!.toDate().getTime() - clickedDate.getTime()
    );
    return diffA - diffB;
  });

  return candidates[0];
}

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
    default:
      return { text: "Unknown", className: "bg-gray-50 text-gray-600" };
  }
}

function locationDisplay(location: ClockEvent["location"]) {
  if (!location) {
    return { text: "No location recorded", mapUrl: null as string | null };
  }
  if (typeof location === "string") {
    return { text: location, mapUrl: null as string | null };
  }
  const text = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
  const mapUrl = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  return { text, mapUrl };
}

function EventSide({
  label,
  event,
}: {
  label: string;
  event: ClockEvent | null;
}) {
  if (!event) {
    return (
      <div className="flex-1 rounded-lg border border-dashed border-gray-200 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
          {label}
        </p>
        <p className="mt-3 text-sm text-gray-600">
          No matching event found for this day.
        </p>
      </div>
    );
  }

  const badge = sourceLabel(event.source);
  const loc = locationDisplay(event.location);

  return (
    <div className="flex-1 rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
        {label}
      </p>

      <div className="mt-3 aspect-square w-full overflow-hidden rounded-md bg-gray-100">
        {event.photoUrl ? (
          <img
            src={event.photoUrl}
            alt={`${label} proof photo`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-600">
            No photo recorded
          </div>
        )}
      </div>

      <p className="mt-3 font-mono text-sm text-gray-950">
        {event.timestamp ? event.timestamp.toDate().toLocaleString() : "-"}
      </p>

      <span
        className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
      >
        {badge.text}
      </span>

      <p className="mt-2 text-xs text-gray-600">
        {loc.mapUrl ? (
          <button
            type="button"
            onClick={() => window.open(loc.mapUrl as string, "_blank")}
            className="text-accent hover:underline"
          >
            {loc.text}
          </button>
        ) : (
          loc.text
        )}
      </p>

      {event.note && (
        <p className="mt-2 text-xs text-gray-600">Note: {event.note}</p>
      )}
    </div>
  );
}

export default function ClockEventDetailModal({
  event,
  allEvents,
  onClose,
}: Props) {
  const pair = findPairedEvent(event, allEvents);
  const clockInEvent = event.type === "in" ? event : pair;
  const clockOutEvent = event.type === "out" ? event : pair;
  const dayLabel = event.timestamp
    ? event.timestamp.toDate().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown date";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-950">
              {event.employeeName}
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              {dayLabel} - {event.siteName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <EventSide label="Clock in" event={clockInEvent} />
          <EventSide label="Clock out" event={clockOutEvent} />
        </div>
      </div>
    </div>
  );
}
