import type { ClockEvent } from "@/lib/types";
import { photoStatus } from "@/lib/clockStatus";
import { clockPhotoCellLabel, clockPhotoState } from "@/lib/clockPhoto";

// Photo column in the Time Tracking log (search results and day view).
// The mobile app records the clock event first and attaches its photo a
// moment later, so an event can briefly have no photo yet - shown as
// "Uploading", never as "-", and flagged red if it never arrives.
// Otherwise "View" / "Removed" (retention sweep) / "-" (see
// lib/clockPhoto.ts). A removed photo wins over pending/missing.
export function PhotoStatusCell({ event }: { event: ClockEvent }) {
  const status = photoStatus(event);
  if (clockPhotoState(event) !== "removed") {
    if (status === "pending") {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          Uploading
        </span>
      );
    }
    if (status === "missing") {
      return (
        <span
          className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
          title="A photo was taken for this clock event but never reached the server."
        >
          Photo missing
        </span>
      );
    }
  }
  return <>{clockPhotoCellLabel(event)}</>;
}
