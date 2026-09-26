"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ClockEvent } from "@/lib/types";
import { useSites } from "@/lib/hooks/useSites";
import { authedFetch } from "@/lib/authedFetch";
import {
  haversineMeters,
  classifyAccuracy,
  classifySiteProximity,
  isAccuracyTooLowForSite,
  buildGoogleMapsUrl,
  DEFAULT_SITE_RADIUS_METERS,
} from "@/lib/geo";

// Leaflet touches window/document at import time, so this must never be
// pulled into a server render.
const MiniMap = dynamic(() => import("@/components/time/MiniMap").then((m) => m.MiniMap), {
  ssr: false,
  loading: () => <div className="h-[120px] w-full rounded-lg border border-gray-200 bg-gray-100" />,
});

const PROXIMITY_BADGE_CLASSES: Record<string, string> = {
  on: "bg-green-50 text-green-700",
  near: "bg-amber-50 text-amber-700",
  off: "bg-red-50 text-red-700",
  unknown: "bg-gray-100 text-gray-600",
};

export function EventLocation({ event }: { event: ClockEvent }) {
  const { sites } = useSites();

  const hasCoords = !!event.location && typeof event.location === "object";
  const lat = hasCoords ? (event.location as { lat: number; lng: number }).lat : null;
  const lng = hasCoords ? (event.location as { lat: number; lng: number }).lng : null;

  // Only ever holds a freshly-fetched address - event.locationAddress
  // (already-resolved, from a prior fetch or the server-side trigger) is
  // read directly at render time below instead of copied into state.
  const [fetchedAddress, setFetchedAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null || event.locationAddress) return;

    let cancelled = false;
    // A slow/dead connection on the admin's own end should never leave
    // this stuck on "Locating..." forever - it just falls back to the
    // raw coordinates, same as any other lookup failure.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    setAddressLoading(true);
    (async () => {
      try {
        const res = await authedFetch("/api/geocode/reverse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, eventId: event.id }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!cancelled && res.ok && data.address) {
          setFetchedAddress(data.address);
        }
      } catch (err) {
        console.error("Reverse geocode request failed:", err);
      } finally {
        if (!cancelled) setAddressLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [event.id, event.locationAddress, lat, lng]);

  if (lat == null || lng == null) {
    return <p className="mt-2 text-sm text-gray-500">No location recorded</p>;
  }

  const resolvedAddress = event.locationAddress ?? fetchedAddress;

  const site = event.siteId ? sites.find((s) => s.id === event.siteId) : undefined;
  const distanceMeters =
    site && typeof site.lat === "number" && typeof site.lng === "number"
      ? haversineMeters(lat, lng, site.lat, site.lng)
      : null;
  const radiusMeters = site?.radiusMeters ?? DEFAULT_SITE_RADIUS_METERS;
  const proximity = classifySiteProximity(distanceMeters, event.siteName, radiusMeters);

  const accuracyMeters = event.locationAccuracyM ?? null;
  const accuracy = accuracyMeters != null ? classifyAccuracy(accuracyMeters) : null;
  const accuracyTooLow =
    accuracyMeters != null &&
    distanceMeters != null &&
    isAccuracyTooLowForSite(accuracyMeters, radiusMeters);

  const addressText = resolvedAddress ?? (addressLoading ? "Locating..." : `${lat.toFixed(5)}, ${lng.toFixed(5)}`);

  return (
    <div className="mt-2 space-y-1.5">
      <MiniMap lat={lat} lng={lng} />

      <p className="text-sm text-gray-500">{addressText}</p>

      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PROXIMITY_BADGE_CLASSES[proximity.tier]}`}
      >
        {proximity.label}
      </span>

      {accuracy && (
        <p className="text-sm text-gray-500">
          {accuracy.label}
          {accuracyTooLow ? " - accuracy too low to confirm on-site" : ""}
        </p>
      )}

      <a
        href={buildGoogleMapsUrl(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm font-medium text-accent hover:underline"
      >
        Open in Google Maps
      </a>
    </div>
  );
}
