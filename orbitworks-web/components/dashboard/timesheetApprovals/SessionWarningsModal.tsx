"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { formatGeofenceDistance, buildGoogleMapsUrl } from "@/lib/geo";
import type { ClockEvent, JobSite, OverrideEvent } from "@/lib/types";

const ACTION_LABEL: Record<OverrideEvent["action"], string> = {
  in: "Clock in",
  out: "Clock out",
  breakStart: "Start break",
  breakEnd: "End break",
};

// Geofencing (Pro) Part 4 addition - one block per end of the session that
// was outside the fence (clock-in and clock-out are checked independently,
// so both can show).
function GeofenceItem({
  direction,
  event,
  siteName,
}: {
  direction: "in" | "out";
  event: ClockEvent;
  siteName: string;
}) {
  const verb = direction === "in" ? "Clocked in" : "Clocked out";
  const location =
    event.location && typeof event.location === "object" && typeof event.location.lat === "number"
      ? event.location
      : null;

  return (
    <div className="space-y-1.5 rounded-lg bg-amber-50 p-3.5 text-sm">
      <p className="font-medium text-gray-950">
        {verb} outside of {siteName}
      </p>
      {location && event.distanceFromSiteM != null ? (
        <p className="text-gray-600">
          {formatGeofenceDistance(event.distanceFromSiteM)} from site &middot;{" "}
          <a
            href={buildGoogleMapsUrl(location.lat, location.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent hover:underline"
          >
            View on map
          </a>
        </p>
      ) : (
        <p className="text-gray-600">Location wasn&apos;t available</p>
      )}
      {event.reason && <p className="text-gray-600">Reason: {event.reason}</p>}
      {event.source === "supervisorOverride" && event.authorizedByName && (
        <p className="text-gray-600">Overridden by {event.authorizedByName}</p>
      )}
    </div>
  );
}

// Auto site detection - info-only, never blocks. Only ever set on a
// clock-in (see functions/src/clockEvents.ts), so there's no direction
// prop like GeofenceItem above needs.
function SiteMismatchItem({ event }: { event: ClockEvent }) {
  return (
    <div className="space-y-1.5 rounded-lg bg-amber-50 p-3.5 text-sm">
      <p className="font-medium text-gray-950">
        Clocked in at {event.siteName || "an unassigned site"}
      </p>
      <p className="text-gray-600">This isn&apos;t one of their assigned job sites.</p>
    </div>
  );
}

// Auto site detection - unlike every other item in this modal, this one
// isn't purely informational: it can only ever appear for a clock-in whose
// siteId is null AND was flagged outside a geofence (see
// useTimesheetApprovals.ts's hasNoSiteDetectedWarning), so there's no
// existing site name to show - the admin has to pick the real one.
function NoSiteDetectedItem({
  sites,
  onAssign,
  onAssigned,
}: {
  sites: JobSite[];
  onAssign: (siteId: string) => Promise<void>;
  onAssigned: () => void;
}) {
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!selectedSiteId) return;
    setSaving(true);
    setError("");
    try {
      await onAssign(selectedSiteId);
      onAssigned();
    } catch (err) {
      console.error("Assign session site error:", err);
      setError("Couldn't assign a site. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-amber-50 p-3.5 text-sm">
      <p className="font-medium text-gray-950">No job site detected</p>
      <p className="text-gray-600">
        This clock-in wasn&apos;t near any fenced site. Assign one:
      </p>
      <div className="flex gap-2">
        <select
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">Select a site...</option>
          {sites
            .filter((s) => s.active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          disabled={!selectedSiteId || saving}
          onClick={handleSave}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Assign"}
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}

// Reused for both the supervisor-override warning and the Geofencing
// (Pro) Part 4 addition - one modal listing every warning on a session,
// rather than a separate modal per warning type. Renamed from
// OverrideDetailsModal, which this replaces.
export default function SessionWarningsModal({
  employeeName,
  siteName,
  clockInEvent,
  clockOutEvent,
  overrideEventId,
  sites,
  onAssignSite,
  onClose,
}: {
  employeeName: string;
  siteName: string;
  clockInEvent: ClockEvent;
  clockOutEvent: ClockEvent;
  overrideEventId?: string;
  sites: JobSite[];
  onAssignSite: (siteId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { userData } = useAuth();
  const [overrideEvent, setOverrideEvent] = useState<OverrideEvent | null>(null);
  const [overrideLoading, setOverrideLoading] = useState(!!overrideEventId);
  const [overrideError, setOverrideError] = useState("");

  useEffect(() => {
    if (!overrideEventId || !userData?.companyId) return;
    let cancelled = false;

    async function load() {
      try {
        const ref = doc(
          db,
          "companies",
          userData!.companyId,
          "overrideEvents",
          overrideEventId!
        );
        const snap = await getDoc(ref);
        if (cancelled) return;
        if (snap.exists()) {
          setOverrideEvent({ id: snap.id, ...(snap.data() as Omit<OverrideEvent, "id">) });
        } else {
          setOverrideError("This override record couldn't be found.");
        }
      } catch (err) {
        console.error("Override event fetch error:", err);
        if (!cancelled) setOverrideError("Couldn't load override details. Try again.");
      } finally {
        if (!cancelled) setOverrideLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userData?.companyId, overrideEventId]);

  const clockInOutside = clockInEvent.geofenceStatus === "outside";
  const clockOutOutside = clockOutEvent.geofenceStatus === "outside";
  const siteMismatch = clockInEvent.siteMismatch === true;
  const noSiteDetected = clockInEvent.siteId == null && clockInEvent.geofenceStatus === "outside";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-950">Session warnings</h2>
        <p className="mt-0.5 text-xs text-gray-600">{employeeName}</p>

        <div className="mt-3 space-y-3">
          {overrideEventId &&
            (overrideLoading ? (
              <p className="text-sm text-gray-600">Loading...</p>
            ) : overrideError ? (
              <p className="text-sm text-red-600">{overrideError}</p>
            ) : overrideEvent ? (
              <div className="space-y-2.5 rounded-lg bg-amber-50 p-3.5 text-sm">
                <p className="font-medium text-gray-950">Supervisor override</p>
                <div>
                  <p className="text-xs font-medium text-gray-600">Authorized by</p>
                  <p className="text-gray-950">{overrideEvent.supervisorName ?? "Unknown"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Action</p>
                  <p className="text-gray-950">{ACTION_LABEL[overrideEvent.action]}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Reason</p>
                  <p className="text-gray-950">{overrideEvent.reason}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Recorded</p>
                  <p className="text-gray-950">
                    {overrideEvent.createdAt
                      ? overrideEvent.createdAt.toDate().toLocaleString()
                      : "-"}
                  </p>
                </div>
              </div>
            ) : null)}

          {clockInOutside && (
            <GeofenceItem direction="in" event={clockInEvent} siteName={siteName} />
          )}
          {clockOutOutside && (
            <GeofenceItem direction="out" event={clockOutEvent} siteName={siteName} />
          )}
          {siteMismatch && <SiteMismatchItem event={clockInEvent} />}
          {noSiteDetected && (
            <NoSiteDetectedItem sites={sites} onAssign={onAssignSite} onAssigned={onClose} />
          )}
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
