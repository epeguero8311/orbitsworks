"use client";

import { useEffect, useState, type ReactNode } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { formatGeofenceDistance, buildGoogleMapsUrl } from "@/lib/geo";
import { formatMinutesAsTime } from "@/lib/reportUtils";
import {
  sortWarningsBySeverity,
  type SessionWarning,
  type WarningSeverity,
} from "@/lib/sessionWarnings";
import type { ClockEvent, JobSite, OverrideEvent } from "@/lib/types";

const ACTION_LABEL: Record<OverrideEvent["action"], string> = {
  in: "Clock in",
  out: "Clock out",
  breakStart: "Start break",
  breakEnd: "End break",
};

function formatTime(ts: ClockEvent["timestamp"]) {
  return ts ? ts.toDate().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "-";
}

// Soft red/yellow card shell every warning type below renders into - red
// warnings first, then yellow, per the modal's sort order.
function WarningCard({
  severity,
  title,
  children,
}: {
  severity: WarningSeverity;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`space-y-1.5 rounded-lg p-3.5 text-sm ${
        severity === "red" ? "bg-red-50" : "bg-amber-50"
      }`}
    >
      <p className="font-medium text-gray-950">{title}</p>
      {children}
    </div>
  );
}

function GeofenceItem({
  severity,
  direction,
  event,
  siteName,
}: {
  severity: WarningSeverity;
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
    <WarningCard severity={severity} title={`${verb} outside of ${siteName}`}>
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
    </WarningCard>
  );
}

function UnassignedSiteItem({
  severity,
  siteName,
  assignedSiteNames,
}: {
  severity: WarningSeverity;
  siteName: string;
  assignedSiteNames: string[];
}) {
  return (
    <WarningCard severity={severity} title={`Clocked in at ${siteName || "an unassigned site"}`}>
      <p className="text-gray-600">
        {assignedSiteNames.length > 0
          ? `Assigned to ${assignedSiteNames.join(", ")} - this isn't one of them.`
          : "This isn't one of their assigned job sites."}
      </p>
    </WarningCard>
  );
}

function NoSiteDetectedItem({
  severity,
  sites,
  onAssign,
  onAssigned,
}: {
  severity: WarningSeverity;
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
    <WarningCard severity={severity} title="No job site detected">
      <p className="text-gray-600">This clock-in wasn&apos;t near any fenced site. Assign one:</p>
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
    </WarningCard>
  );
}

function TimeWarningItem({
  severity,
  title,
  expectedMinutes,
  actualTime,
}: {
  severity: WarningSeverity;
  title: string;
  expectedMinutes: number;
  actualTime: ClockEvent["timestamp"];
}) {
  return (
    <WarningCard severity={severity} title={title}>
      <p className="text-gray-600">
        Expected by {formatMinutesAsTime(expectedMinutes)}, actual {formatTime(actualTime)}
      </p>
    </WarningCard>
  );
}

function FaceWarningItem({
  severity,
  title,
  direction,
  event,
}: {
  severity: WarningSeverity;
  title: string;
  direction: "in" | "out";
  event: ClockEvent;
}) {
  const faceCheck = event.faceCheck;
  return (
    <WarningCard severity={severity} title={title}>
      <div className="grid max-w-xs grid-cols-2 gap-2">
        <div>
          <p className="mb-1 text-center text-xs text-gray-500">
            {direction === "in" ? "Clock in" : "Clock out"} photo
          </p>
          <div className="aspect-square overflow-hidden rounded-md bg-white">
            {event.photoUrl ? (
              <img src={event.photoUrl} alt="Clock photo" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-gray-600">No photo</div>
            )}
          </div>
        </div>
        <div>
          <p className="mb-1 text-center text-xs text-gray-500">Reference photo</p>
          <div className="aspect-square overflow-hidden rounded-md bg-white">
            {faceCheck?.referencePhotoUrl ? (
              <img
                src={faceCheck.referencePhotoUrl}
                alt="Employee reference photo"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-gray-600">No photo</div>
            )}
          </div>
        </div>
      </div>
      {faceCheck?.similarity != null && (
        <p className="text-gray-600">Similarity: {faceCheck.similarity}%</p>
      )}
    </WarningCard>
  );
}

function warningTitle(warning: SessionWarning): string {
  switch (warning.type) {
    case "lateClockIn":
      return "Late clock-in";
    case "earlyClockOut":
      return "Early clock-out";
    case "maxHours":
      return "Max hours exceeded";
    case "overtime":
      return "Overtime";
    case "missedClockOut":
      return "Missed clock-out";
    case "maxBreak":
      return "Break too long";
    case "faceLowConfidence":
      return "Low-confidence face match";
    case "faceMismatch":
      return "Face mismatch";
    case "faceNoFace":
      return "No face detected";
    default:
      return "";
  }
}

// Reused for every warning type on a session - one modal listing every
// warning that fired, rather than a separate modal per type. Renders red
// (urgent) warnings before yellow ones, each as its own evidence card -
// see lib/sessionWarnings.ts for what fires each type and why.
export default function SessionWarningsModal({
  employeeName,
  siteName,
  warnings,
  sites,
  onAssignSite,
  onClose,
}: {
  employeeName: string;
  siteName: string;
  warnings: SessionWarning[];
  sites: JobSite[];
  onAssignSite: (siteId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { userData } = useAuth();
  const overrideWarning = warnings.find((w) => w.type === "supervisorOverride");
  const [overrideEvent, setOverrideEvent] = useState<OverrideEvent | null>(null);
  const [overrideLoading, setOverrideLoading] = useState(!!overrideWarning);
  const [overrideError, setOverrideError] = useState("");

  useEffect(() => {
    if (!overrideWarning || overrideWarning.type !== "supervisorOverride" || !userData?.companyId) return;
    const overrideEventId = overrideWarning.overrideEventId;
    let cancelled = false;

    async function load() {
      try {
        const ref = doc(db, "companies", userData!.companyId, "overrideEvents", overrideEventId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.companyId, overrideWarning]);

  const sortedWarnings = sortWarningsBySeverity(warnings);

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

        <div className="mt-3 max-h-[70vh] space-y-3 overflow-y-auto">
          {sortedWarnings.map((warning, i) => {
            switch (warning.type) {
              case "supervisorOverride":
                return (
                  <div key={i}>
                    {overrideLoading ? (
                      <p className="text-sm text-gray-600">Loading...</p>
                    ) : overrideError ? (
                      <p className="text-sm text-red-600">{overrideError}</p>
                    ) : overrideEvent ? (
                      <WarningCard severity={warning.severity} title="Supervisor override">
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
                            {overrideEvent.createdAt ? overrideEvent.createdAt.toDate().toLocaleString() : "-"}
                          </p>
                        </div>
                      </WarningCard>
                    ) : null}
                  </div>
                );
              case "outsideGeofence":
                return (
                  <GeofenceItem
                    key={i}
                    severity={warning.severity}
                    direction={warning.direction}
                    event={warning.event}
                    siteName={siteName}
                  />
                );
              case "unassignedSite":
                return (
                  <UnassignedSiteItem
                    key={i}
                    severity={warning.severity}
                    siteName={warning.siteName}
                    assignedSiteNames={warning.assignedSiteNames}
                  />
                );
              case "noSiteDetected":
                return (
                  <NoSiteDetectedItem
                    key={i}
                    severity={warning.severity}
                    sites={sites}
                    onAssign={onAssignSite}
                    onAssigned={onClose}
                  />
                );
              case "lateClockIn":
                return (
                  <TimeWarningItem
                    key={i}
                    severity={warning.severity}
                    title={warningTitle(warning)}
                    expectedMinutes={warning.expectedMinutes}
                    actualTime={warning.actualTime}
                  />
                );
              case "earlyClockOut":
                return (
                  <TimeWarningItem
                    key={i}
                    severity={warning.severity}
                    title={warningTitle(warning)}
                    expectedMinutes={warning.expectedMinutes}
                    actualTime={warning.actualTime}
                  />
                );
              case "maxHours":
                return (
                  <WarningCard key={i} severity={warning.severity} title={warningTitle(warning)}>
                    <p className="text-gray-600">
                      Worked {warning.hours.toFixed(1)}h, limit {warning.thresholdHours}h
                    </p>
                  </WarningCard>
                );
              case "overtime":
                return (
                  <WarningCard key={i} severity={warning.severity} title={warningTitle(warning)}>
                    <p className="text-gray-600">
                      {warning.weekHours.toFixed(1)}h this week, limit {warning.thresholdHours}h/week
                    </p>
                  </WarningCard>
                );
              case "missedClockOut":
                return (
                  <WarningCard key={i} severity={warning.severity} title={warningTitle(warning)}>
                    <p className="text-gray-600">
                      {warning.note || "The system clocked this employee out automatically."} (
                      {formatTime(warning.actualTime)})
                    </p>
                  </WarningCard>
                );
              case "maxBreak":
                return (
                  <WarningCard key={i} severity={warning.severity} title={warningTitle(warning)}>
                    <p className="text-gray-600">
                      Break was {Math.round(warning.breakMinutes)} min, limit {warning.thresholdMinutes} min
                    </p>
                  </WarningCard>
                );
              case "faceLowConfidence":
              case "faceMismatch":
              case "faceNoFace":
                return (
                  <FaceWarningItem
                    key={i}
                    severity={warning.severity}
                    title={warningTitle(warning)}
                    direction={warning.direction}
                    event={warning.event}
                  />
                );
              default:
                return null;
            }
          })}
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
