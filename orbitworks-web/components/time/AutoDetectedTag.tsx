import type { ClockEvent } from "@/lib/types";

// Geofencing (Pro) auto site detection - shown next to the site name
// wherever Time Tracking displays it. Renders nothing for any event that
// predates this feature, whose company has no fenced sites, or whose site
// an admin has since manually assigned (see assignSessionSite) - "old
// events show nothing extra" per spec.
export function AutoDetectedTag({ event }: { event: ClockEvent }) {
  if (!event.siteAutoDetected) return null;

  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
      Auto-detected
    </span>
  );
}
