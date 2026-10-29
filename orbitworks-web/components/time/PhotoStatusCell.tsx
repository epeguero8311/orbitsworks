import type { ClockEvent } from "@/lib/types";
import { photoStatus } from "@/lib/clockStatus";

// Photo column in the Time Tracking log (search results and day view).
// The mobile app now records the clock event first and attaches its photo
// a moment later, so an event can briefly have no photo yet - shown as
// "Uploading", never as "-", and flagged red if it never arrives.
export function PhotoStatusCell({ event }: { event: ClockEvent }) {
  switch (photoStatus(event)) {
    case "ready":
      return <>View</>;
    case "pending":
      return (
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          Uploading
        </span>
      );
    case "missing":
      return (
        <span
          className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
          title="A photo was taken for this clock event but never reached the server."
        >
          Photo missing
        </span>
      );
    default:
      return <>-</>;
  }
}
