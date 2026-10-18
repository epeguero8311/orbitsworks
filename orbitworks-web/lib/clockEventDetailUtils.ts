import type { ClockEvent } from "@/lib/types";

export function effectiveDate(event: ClockEvent): Date | null {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  return ts ? ts.toDate() : null;
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
    case "tempLink":
      return { text: "Temp link", className: "bg-teal-50 text-teal-700" };
    default:
      return { text: "Unknown", className: "bg-gray-50 text-gray-600" };
  }
}

export function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
