import type { ClockEvent } from "@/lib/types";
import { GeofenceBadge } from "@/components/time/GeofenceBadge";

// Geofencing (Pro) Part 4 - sits right below EventLocation in EventSide.tsx
// ("wherever the photo and location already show"). Renders nothing under
// the same conditions as GeofenceBadge - no geofenced site, Core plan, or
// a pre-Part-3 event all look identical (nothing shown, no error).
export function GeofenceDetail({ event }: { event: ClockEvent }) {
  if (!event.geofenceStatus) return null;

  return (
    <div className="mt-2 space-y-1">
      <GeofenceBadge event={event} />
      {event.reason && (
        <p className="text-xs text-gray-600">Reason: {event.reason}</p>
      )}
      {event.source === "supervisorOverride" && event.authorizedByName && (
        <p className="text-xs text-gray-600">Overridden by {event.authorizedByName}</p>
      )}
    </div>
  );
}
