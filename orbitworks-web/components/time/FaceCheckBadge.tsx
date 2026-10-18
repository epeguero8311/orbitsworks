import type { ClockEvent } from "@/lib/types";
import { faceCheckLabel } from "@/lib/clockStatus";

// Face Verification (Pro) - shown in the Time Tracking log (both the
// search-results table and the day view), same placement convention as
// GeofenceBadge. Unlike GeofenceBadge, "not checked" is always rendered
// as an explicit gray badge rather than nothing - per spec, that state
// (no pfp, feature off, Core plan, or predates this feature) should look
// the same everywhere, not just be silent.
export function FaceCheckBadge({ event }: { event: ClockEvent }) {
  const { text, className } = faceCheckLabel(event.faceCheck);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {text}
    </span>
  );
}
