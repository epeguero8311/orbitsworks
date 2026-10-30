import type { ClockEvent } from "@/lib/types";

// Employee App Phase 4 - a punch the phone saved offline (or on slow
// signal) and sent later. Its time is when the employee made it on the
// phone, not when it reached the server. Shown next to the site name
// wherever AutoDetectedTag is. Renders nothing for any other event.
export function SyncedLateTag({ event }: { event: ClockEvent }) {
  if (event.syncedLate !== true) return null;

  return (
    <span
      className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
      title="Saved on the phone without signal and sent later. The time is when the punch was made."
    >
      Synced late
    </span>
  );
}
