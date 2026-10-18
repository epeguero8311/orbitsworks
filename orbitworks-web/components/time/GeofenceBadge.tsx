import type { ClockEvent } from "@/lib/types";
import { formatGeofenceDistance } from "@/lib/geo";

// Geofencing (Pro) Part 4 - shown in the Time Tracking log (both the
// search-results table and the day view) and reused as the seed for the
// detail view's own inside/outside line. Renders nothing whenever
// geofenceStatus is absent - a non-geofenced site, a Core company, or an
// event from before this feature, all look identical (no badge, no error).
export function GeofenceBadge({ event }: { event: ClockEvent }) {
  if (!event.geofenceStatus) return null;

  if (event.geofenceStatus === "outside") {
    const distance =
      event.distanceFromSiteM != null ? ` - ${formatGeofenceDistance(event.distanceFromSiteM)}` : "";
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        Outside geofence{distance}
      </span>
    );
  }

  // Quiet on purpose - the warning above is what matters, this is just a
  // low-key confirmation everything's normal.
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
      At site
    </span>
  );
}
