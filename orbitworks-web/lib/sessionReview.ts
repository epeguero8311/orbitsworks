import type { ClockEvent } from "@/lib/types";
import { photoStatus } from "@/lib/clockStatus";

// Timesheet Approvals > Session review only. Time Tracking keeps
// lib/clockStatus.ts's sourceLabel/faceCheckLabel unchanged.

export type Tag = { text: string; className: string };

// Source tag mapping (confirmed 2026-11-24). "Supervisor app" = every source
// written by the supervisor app: pin (ClockCameraScreen), supervisorPin
// (Breaks), supervisorOverride (Override) and faceMatch (legacy - nothing
// writes it today). autoBreakEnd is written by BOTH the supervisor app and
// the website, so it keeps its own tag.
export function sessionSourceTag(source: ClockEvent["source"] | undefined): Tag {
  switch (source) {
    case "pin":
    case "supervisorPin":
    case "supervisorOverride":
    case "faceMatch":
      return { text: "Supervisor app", className: "bg-blue-50 text-blue-700" };
    case "employeeApp":
      return { text: "Employee app", className: "bg-gray-100 text-gray-700" };
    case "adminManual":
      return { text: "Admin manual", className: "bg-purple-50 text-purple-700" };
    case "autoClockOut":
      return { text: "Auto clock-out", className: "bg-orange-50 text-orange-700" };
    case "autoBreakEnd":
      return { text: "Auto break end", className: "bg-amber-50 text-amber-700" };
    case "employeeDeactivated":
      return { text: "Deactivated clock-out", className: "bg-red-50 text-red-700" };
    case "tempLink":
      return { text: "Temp link", className: "bg-teal-50 text-teal-700" };
    default:
      return { text: "Unknown", className: "bg-gray-50 text-gray-600" };
  }
}

const RED = "bg-red-50 text-red-700";
const YELLOW = "bg-amber-50 text-amber-700";
const GREEN = "bg-green-50 text-green-700";
const GRAY = "bg-gray-100 text-gray-500";

// What the photo slot shows. "placeholder" = the gray box with a red tag
// in place of the raw image (missing photo, or no face found in it - a
// black/covered photo comes back from the face check as noFace).
export type PhotoView =
  | { kind: "photo" }
  | { kind: "uploading" }
  | { kind: "placeholder"; text: "No face detected" | "No photo" };

export function sessionPhotoView(event: ClockEvent): PhotoView {
  const status = photoStatus(event);
  if (status === "pending") return { kind: "uploading" };
  if (status !== "ready") return { kind: "placeholder", text: "No photo" };
  if (event.faceCheck?.status === "noFace") return { kind: "placeholder", text: "No face detected" };
  return { kind: "photo" };
}

// Face tag: a mismatch is always red, whatever its score (decision 4B), so
// the tag never disagrees with the red "Face mismatch" alert. For matches:
// green >= 90%, yellow 70-89%, red < 70%. No face = red. Gray when the
// check hasn't run (Core plan, no reference photo, or still pending).
export function sessionFaceTag(event: ClockEvent): Tag {
  const view = sessionPhotoView(event);
  if (view.kind === "placeholder") return { text: view.text, className: RED };
  const fc = event.faceCheck;
  if (fc?.status === "mismatch") {
    return { text: `Face mismatch${fc.similarity != null ? ` ${Math.round(fc.similarity)}%` : ""}`, className: RED };
  }
  if (!fc || fc.similarity == null) {
    return { text: "Face not checked", className: GRAY };
  }
  const pct = Math.round(fc.similarity);
  if (pct >= 90) return { text: `Face match ${pct}%`, className: GREEN };
  if (pct >= 70) return { text: `Face match ${pct}%`, className: YELLOW };
  return { text: `Face match ${pct}%`, className: RED };
}

function effectiveMs(e: ClockEvent): number | null {
  const ts = e.adjustedTimestamp ?? e.timestamp;
  return ts ? ts.toMillis() : null;
}

export type SessionBreak = { start: ClockEvent; end: ClockEvent | null };

// Break pairs in time order, from the session's own events (same pairing as
// useTimesheetApprovals: a breakStart opens, the next breakEnd closes it).
export function sessionBreaks(sessionEvents: ClockEvent[]): SessionBreak[] {
  const sorted = [...sessionEvents].sort((a, b) => (effectiveMs(a) ?? 0) - (effectiveMs(b) ?? 0));
  const out: SessionBreak[] = [];
  let open: ClockEvent | null = null;
  for (const e of sorted) {
    if (e.type === "breakStart" && !open) open = e;
    else if (e.type === "breakEnd" && open) {
      out.push({ start: open, end: e });
      open = null;
    }
  }
  if (open) out.push({ start: open, end: null });
  return out;
}

export function formatClock(e: ClockEvent | null): string {
  const ms = e ? effectiveMs(e) : null;
  return ms == null ? "-" : new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// "Break 12:10 PM - 1:00 PM, 50m"
export function breakLine(b: SessionBreak): string {
  const s = effectiveMs(b.start);
  const e = b.end ? effectiveMs(b.end) : null;
  if (s == null || e == null) return `Break ${formatClock(b.start)} - no end recorded`;
  const mins = Math.max(0, Math.round((e - s) / 60000));
  const dur = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  return `Break ${formatClock(b.start)} - ${formatClock(b.end)}, ${dur}`;
}

export function sessionStartMs(e: ClockEvent): number {
  return effectiveMs(e) ?? 0;
}
