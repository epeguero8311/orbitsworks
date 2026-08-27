import type { ClockEvent } from "./types";

// Single source of truth for mapping a clock event's raw type to a display
// status, plus shared badge label helpers, so the dashboard, time tracking
// page, and event tables can never drift out of sync with each other.
export type ClockStatus = "in" | "break" | "out";

const STATUS_BY_EVENT_TYPE: Record<ClockEvent["type"], ClockStatus> = {
  in: "in",
  breakStart: "break",
  breakEnd: "in",
  out: "out",
};

export function deriveStatus(type: ClockEvent["type"] | undefined): ClockStatus {
  if (!type) return "out";
  return STATUS_BY_EVENT_TYPE[type] ?? "out";
}

export function typeLabel(type: ClockEvent["type"]): { text: string; className: string } {
  switch (type) {
    case "in":
      return { text: "Clock in", className: "text-green-700" };
    case "out":
      return { text: "Clock out", className: "text-gray-600" };
    case "breakStart":
      return { text: "Start break", className: "text-amber-700" };
    case "breakEnd":
      return { text: "End break", className: "text-blue-700" };
    default:
      return { text: "Unknown", className: "text-gray-600" };
  }
}

export function sourceLabel(source: ClockEvent["source"]): { text: string; className: string } {
  switch (source) {
    case "faceMatch":
      return { text: "Face match", className: "bg-green-50 text-green-700" };
    case "pin":
      return { text: "PIN", className: "bg-purple-50 text-purple-700" };
    case "supervisorOverride":
      return { text: "Supervisor override", className: "bg-amber-50 text-amber-700" };
    case "adminManual":
      return { text: "Admin manual", className: "bg-blue-50 text-blue-700" };
    case "autoClockOut":
      return { text: "Auto clock-out", className: "bg-orange-50 text-orange-700" };
    case "supervisorPin":
      return { text: "Supervisor PIN", className: "bg-indigo-50 text-indigo-700" };
    case "autoBreakEnd":
      return { text: "Auto break end", className: "bg-orange-50 text-orange-700" };
    default:
      return { text: "Unknown", className: "bg-gray-50 text-gray-600" };
  }
}