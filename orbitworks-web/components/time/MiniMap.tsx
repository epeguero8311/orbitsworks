"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { buildGoogleMapsUrl } from "@/lib/geo";

// A plain divIcon instead of Leaflet's default marker image - the default
// icon's image assets don't resolve through Next's bundler without extra
// webpack config, and this static preview only ever needs a simple dot.
const MARKER_ICON = L.divIcon({
  className: "mini-map-marker",
  html: '<div class="mini-map-marker-dot"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    // Keeps the attribution control (required by the tile license) but
    // drops just the "Leaflet" flag/link prefix - there's no MapContainer
    // prop for this, only the control instance's own method.
    mapRef.current?.attributionControl.setPrefix(false);
  }, []);

  return (
    <div className="isolate relative z-0 h-[120px] w-full overflow-hidden rounded-lg border border-gray-200 mini-map-wrapper">
      <MapContainer
        ref={mapRef}
        center={[lat, lng]}
        zoom={16}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <Marker position={[lat, lng]} icon={MARKER_ICON} />
      </MapContainer>

      <a
        href={buildGoogleMapsUrl(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open location in Google Maps"
        className="absolute inset-0 z-10 cursor-pointer"
      />

      <style>{`
        .mini-map-wrapper .leaflet-control-attribution {
          font-size: 9px;
          padding: 0 4px;
          background: rgba(255, 255, 255, 0.6);
        }
        .mini-map-marker-dot {
          box-sizing: border-box;
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          background: #3b6fe0;
          border: 2px solid #fff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }
      `}</style>
    </div>
  );
}
