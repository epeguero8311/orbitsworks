"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { SiteExitsNote } from "@/components/time/SiteExitsNote";
import { lateLabel } from "@/lib/syncedLate";
import { replacedSourceText } from "@/lib/punchFlags";
import { siteExitTone } from "@/lib/siteExits";
import { formatGeofenceDistance } from "@/lib/geo";
import { formatMinutesAsTime } from "@/lib/reportUtils";
import { faceResultText } from "@/lib/clockPhoto";
import { sortWarningsBySeverity, type SessionWarning, type WarningSeverity } from "@/lib/sessionWarnings";
import type { ClockEvent, JobSite, OverrideEvent, SiteExit } from "@/lib/types";

// Session review's right column. One card per warning (red first, then
// yellow): a title and one short detail line. The evidence the old
// "Session warnings" window showed inside each card (photos, map link) is
// now in the main area of the modal. Severity comes from
// lib/sessionWarnings.ts WARNING_SEVERITY, unchanged.

const ACTION_LABEL: Record<OverrideEvent["action"], string> = {
  in: "clock in",
  out: "clock out",
  breakStart: "start break",
  breakEnd: "end break",
};
const PUNCH_WORD: Record<string, string> = { in: "clock-in", out: "clock-out", breakStart: "break start", breakEnd: "break end" };

function formatTime(ts: ClockEvent["timestamp"]) {
  return ts ? ts.toDate().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "-";
}

function whenLabel(atMs: number | null): string {
  if (atMs === null) return "";
  return new Date(atMs).toLocaleString([], { hour: "numeric", minute: "2-digit" });
}

function AlertCard({ severity, title, children }: { severity: WarningSeverity | "gray"; title: string; children?: React.ReactNode }) {
  const tone =
    severity === "red" ? "bg-red-50" : severity === "yellow" ? "bg-amber-50" : "border border-gray-200 bg-gray-50";
  return (
    <div className={`space-y-1 rounded-lg p-3 text-sm ${tone}`}>
      <p className="font-medium text-gray-950">{title}</p>
      {children}
    </div>
  );
}

function Detail({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-600">{children}</p>;
}

const dir = (d: "in" | "out") => (d === "in" ? "Clock in" : "Clock out");

function OverrideDetail({ overrideEventId }: { overrideEventId: string }) {
  const { userData } = useAuth();
  const [state, setState] = useState<{ ev: OverrideEvent | null; error: string } | null>(null);
  useEffect(() => {
    if (!userData?.companyId) return;
    let cancelled = false;
    getDoc(doc(db, "companies", userData.companyId, "overrideEvents", overrideEventId))
      .then((snap) => {
        if (cancelled) return;
        setState(
          snap.exists()
            ? { ev: { id: snap.id, ...(snap.data() as Omit<OverrideEvent, "id">) }, error: "" }
            : { ev: null, error: "This override record couldn't be found." }
        );
      })
      .catch((err) => {
        console.error("Override event fetch error:", err);
        if (!cancelled) setState({ ev: null, error: "Couldn't load override details." });
      });
    return () => {
      cancelled = true;
    };
  }, [userData?.companyId, overrideEventId]);

  if (!state) return <Detail>Loading...</Detail>;
  if (!state.ev) return <Detail>{state.error}</Detail>;
  return (
    <Detail>
      {state.ev.supervisorName ?? "A supervisor"} let them {ACTION_LABEL[state.ev.action]}: {state.ev.reason}
    </Detail>
  );
}

function NoSiteAssign({ sites, onAssign, disabled }: { sites: JobSite[]; onAssign: (siteId: string) => Promise<void>; disabled: boolean }) {
  const [siteId, setSiteId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!siteId) return;
    setSaving(true);
    setError("");
    try {
      await onAssign(siteId);
    } catch (err) {
      console.error("Assign session site error:", err);
      setError("Couldn't assign a site. Try again.");
    } finally {
      setSaving(false);
    }
  }
  if (disabled) return <Detail>Wasn&apos;t near any fenced site.</Detail>;
  return (
    <>
      <Detail>Wasn&apos;t near any fenced site. Assign one:</Detail>
      <div className="flex gap-2">
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
          disabled={!siteId || saving}
          onClick={save}
          className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Assign"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </>
  );
}

function renderWarning(
  w: SessionWarning,
  key: number,
  siteName: string,
  sites: JobSite[],
  onAssignSite: (siteId: string) => Promise<void>,
  canEdit: boolean
) {
  switch (w.type) {
    case "supervisorOverride":
      return (
        <AlertCard key={key} severity={w.severity} title="Supervisor override">
          <OverrideDetail overrideEventId={w.overrideEventId} />
        </AlertCard>
      );
    case "outsideGeofence":
      return (
        <AlertCard key={key} severity={w.severity} title={`${dir(w.direction)} off site`}>
          <Detail>
            {w.event.distanceFromSiteM != null
              ? `${formatGeofenceDistance(w.event.distanceFromSiteM)} outside ${siteName}`
              : "Location wasn't available"}
            {w.event.reason ? ` - "${w.event.reason}"` : ""}
          </Detail>
        </AlertCard>
      );
    case "unassignedSite":
      return (
        <AlertCard key={key} severity={w.severity} title="Not their assigned site">
          <Detail>
            {w.assignedSiteNames.length > 0 ? `Assigned to ${w.assignedSiteNames.join(", ")}` : "No assigned job sites"}
          </Detail>
        </AlertCard>
      );
    case "noSiteDetected":
      return (
        <AlertCard key={key} severity={w.severity} title="No job site detected">
          <NoSiteAssign sites={sites} onAssign={onAssignSite} disabled={!canEdit} />
        </AlertCard>
      );
    case "lateClockIn":
      return (
        <AlertCard key={key} severity={w.severity} title="Late clock-in">
          <Detail>
            Expected by {formatMinutesAsTime(w.expectedMinutes)}, clocked in {formatTime(w.actualTime)}
          </Detail>
        </AlertCard>
      );
    case "earlyClockOut":
      return (
        <AlertCard key={key} severity={w.severity} title="Early clock-out">
          <Detail>
            Expected until {formatMinutesAsTime(w.expectedMinutes)}, clocked out {formatTime(w.actualTime)}
          </Detail>
        </AlertCard>
      );
    case "maxHours":
      return (
        <AlertCard key={key} severity={w.severity} title="Max hours exceeded">
          <Detail>
            Worked {w.hours.toFixed(1)}h, limit {w.thresholdHours}h
          </Detail>
        </AlertCard>
      );
    case "overtime":
      return (
        <AlertCard key={key} severity={w.severity} title="Overtime">
          <Detail>
            {w.weekHours.toFixed(1)}h this week, limit {w.thresholdHours}h
          </Detail>
        </AlertCard>
      );
    case "missedClockOut":
      return (
        <AlertCard key={key} severity={w.severity} title="Missed clock-out">
          <Detail>
            {w.note || "Clocked out automatically"} at {formatTime(w.actualTime)}
          </Detail>
        </AlertCard>
      );
    case "maxBreak":
      return (
        <AlertCard key={key} severity={w.severity} title="Break too long">
          <Detail>
            {Math.round(w.breakMinutes)} min, limit {w.thresholdMinutes} min
          </Detail>
        </AlertCard>
      );
    case "autoClockOut":
      return (
        <AlertCard key={key} severity={w.severity} title="Auto clocked out">
          <Detail>
            At {formatTime(w.autoOutTime)} ({w.capHours}h cap), {Math.round(w.realBreakMinutes)} min break deducted
          </Detail>
        </AlertCard>
      );
    case "leftSite":
      return (
        <AlertCard key={key} severity={w.severity} title="Left the job site">
          <SiteExitsNote exits={w.exits} />
        </AlertCard>
      );
    case "syncedLate":
      return (
        <AlertCard key={key} severity={w.severity} title="Synced late">
          <Detail>
            {w.punches.map((p) => `${PUNCH_WORD[p.type] ?? p.type} ${lateLabel(p.lateMs)}${p.timeNotProven ? " (time not proven)" : ""}`).join("; ")}
          </Detail>
        </AlertCard>
      );
    case "punchProblem":
      return (
        <AlertCard key={key} severity={w.severity} title="Punch needs a look">
          <Detail>{w.punches.map((p) => `${PUNCH_WORD[p.type] ?? p.type} ${whenLabel(p.atMs)}: ${p.items.join(", ")}`).join("; ")}</Detail>
        </AlertCard>
      );
    case "punchReplaced":
      return (
        <AlertCard key={key} severity={w.severity} title="Real punch replaced an entry">
          <Detail>
            {w.punches
              .map((p) => `${PUNCH_WORD[p.type] ?? p.type} ${whenLabel(p.atMs)} replaced ${p.replaced.map((r) => `the ${replacedSourceText(r.source)} one`).join(", ")}`)
              .join("; ")}
          </Detail>
        </AlertCard>
      );
    case "faceMismatch":
    case "faceNoFace":
    case "faceLowConfidence": {
      const title = w.type === "faceMismatch" ? "Face mismatch" : w.type === "faceNoFace" ? "No face detected" : "Low-confidence face match";
      const result = faceResultText(w.event.faceCheck);
      return (
        <AlertCard key={key} severity={w.severity} title={title}>
          <Detail>
            {dir(w.direction)} photo{result ? `: ${result}` : ""}
          </Detail>
        </AlertCard>
      );
    }
    default:
      return null;
  }
}

export function SessionAlerts({
  warnings,
  siteExits,
  siteName,
  sites,
  onAssignSite,
  canEdit,
}: {
  warnings: SessionWarning[];
  siteExits: SiteExit[];
  siteName: string;
  sites: JobSite[];
  onAssignSite: (siteId: string) => Promise<void>;
  canEdit: boolean;
}) {
  const grayExits = siteExits.filter((x) => siteExitTone(x) === "gray");
  const sorted = sortWarningsBySeverity(warnings);
  return (
    <div className="space-y-2">
      {sorted.length === 0 && <p className="text-sm text-gray-600">No alerts</p>}
      {sorted.map((w, i) => renderWarning(w, i, siteName, sites, onAssignSite, canEdit))}
      {grayExits.length > 0 && (
        <AlertCard severity="gray" title="Other job site times (no warning)">
          <SiteExitsNote exits={grayExits} />
        </AlertCard>
      )}
    </div>
  );
}
