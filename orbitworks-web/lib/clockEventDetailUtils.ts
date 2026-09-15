import type { ClockEvent } from "@/lib/types";

export function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function effectiveDate(event: ClockEvent): Date | null {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  return ts ? ts.toDate() : null;
}

export function findPairedEvent(
  event: ClockEvent,
  allEvents: ClockEvent[]
): ClockEvent | null {
  const clickedDate = effectiveDate(event);
  if (!clickedDate) return null;
  const wantType = event.type === "in" ? "out" : "in";

  const candidates = allEvents.filter((e) => {
    const d = effectiveDate(e);
    return (
      e.id !== event.id &&
      e.employeeId === event.employeeId &&
      e.type === wantType &&
      d &&
      isSameCalendarDay(d, clickedDate)
    );
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const dA = effectiveDate(a)!.getTime();
    const dB = effectiveDate(b)!.getTime();
    return Math.abs(dA - clickedDate.getTime()) - Math.abs(dB - clickedDate.getTime());
  });

  return candidates[0];
}

export function sourceLabel(source: ClockEvent["source"]) {
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

export function locationDisplay(location: ClockEvent["location"]) {
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

export function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
