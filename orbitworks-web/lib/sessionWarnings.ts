import type { Timestamp } from "firebase/firestore";
import type { ClockEvent } from "@/lib/types";
import type { Alerts, FaceVerificationSettings } from "@/lib/hooks/useCompanySettings";

// Timesheet Approvals' per-session warning icon/modal (SessionWarningsModal,
// ApprovalsTable) - distinct from the company-wide Overview alerts feed
// (lib/dashboardOverviewUtils.ts's AlertItem/ALERT_SEVERITY, backed by
// functions/src/alerts.ts). That feed covers currently-open shifts and
// periodic sweeps under its own three-tier urgent/warning/info severity;
// this module covers a single already-CLOSED session (has both a clock-in
// and clock-out) under a simpler two-tier red/yellow model. The two are
// deliberately not unified - see the plan this shipped under.

export type WarningSeverity = "yellow" | "red";

export type SessionWarningType =
  | "lateClockIn"
  | "earlyClockOut"
  | "maxHours"
  | "overtime"
  | "missedClockOut"
  | "maxBreak"
  | "unassignedSite"
  | "noSiteDetected"
  | "outsideGeofence"
  | "faceLowConfidence"
  | "faceMismatch"
  | "faceNoFace"
  | "supervisorOverride";

// Single source of truth for severity - evaluateSessionWarnings below reads
// this rather than hardcoding a severity per warning, so a type's color can
// never drift from this map.
export const WARNING_SEVERITY: Record<SessionWarningType, WarningSeverity> = {
  lateClockIn: "yellow",
  earlyClockOut: "yellow",
  maxHours: "yellow",
  overtime: "yellow",
  missedClockOut: "yellow",
  maxBreak: "yellow",
  unassignedSite: "yellow",
  noSiteDetected: "yellow",
  outsideGeofence: "red",
  faceLowConfidence: "yellow",
  faceMismatch: "red",
  faceNoFace: "red",
  // Not one of the settings-driven alert types - always shown today
  // regardless of settings, and already treated as the top-priority item
  // in the pre-existing modal, so it stays red here.
  supervisorOverride: "red",
};

// Below FACE_MATCH_THRESHOLD (90, functions/src/rekognition.ts) but at or
// above this floor: "low confidence" (yellow) rather than an outright
// mismatch (red).
export const FACE_LOW_CONFIDENCE_FLOOR = 70;

type Direction = "in" | "out";

export type SessionWarning =
  | { type: "lateClockIn"; severity: WarningSeverity; expectedMinutes: number; actualTime: Timestamp }
  | { type: "earlyClockOut"; severity: WarningSeverity; expectedMinutes: number; actualTime: Timestamp }
  | { type: "maxHours"; severity: WarningSeverity; hours: number; thresholdHours: number }
  | { type: "overtime"; severity: WarningSeverity; weekHours: number; thresholdHours: number }
  | { type: "missedClockOut"; severity: WarningSeverity; note?: string; actualTime: Timestamp }
  | { type: "maxBreak"; severity: WarningSeverity; breakMinutes: number; thresholdMinutes: number }
  | { type: "unassignedSite"; severity: WarningSeverity; siteName: string; assignedSiteNames: string[] }
  | { type: "noSiteDetected"; severity: WarningSeverity }
  | { type: "outsideGeofence"; severity: WarningSeverity; direction: Direction; event: ClockEvent }
  | { type: "faceLowConfidence"; severity: WarningSeverity; direction: Direction; event: ClockEvent }
  | { type: "faceMismatch"; severity: WarningSeverity; direction: Direction; event: ClockEvent }
  | { type: "faceNoFace"; severity: WarningSeverity; direction: Direction; event: ClockEvent }
  | { type: "supervisorOverride"; severity: WarningSeverity; overrideEventId: string };

function withSeverity<T extends SessionWarningType>(
  type: T,
  extra: Omit<Extract<SessionWarning, { type: T }>, "type" | "severity">
): SessionWarning {
  return { type, severity: WARNING_SEVERITY[type], ...extra } as SessionWarning;
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Uses the browser's local time, same as every other display-only time
// computation in this file's caller (ApprovalsTable's formatTime) - there's
// no server-side timezone concern here since nothing is written back.
function minutesOfDay(ts: Timestamp): number {
  const d = ts.toDate();
  return d.getHours() * 60 + d.getMinutes();
}

function effectiveTimestamp(event: ClockEvent): Timestamp | null {
  return event.adjustedTimestamp ?? event.timestamp ?? null;
}

export interface EvaluateSessionWarningsInput {
  clockInEvent: ClockEvent;
  clockOutEvent: ClockEvent;
  hours: number; // raw shift duration (clock-in to clock-out), hours
  breakHours: number;
  // Cumulative NET worked hours (breaks excluded) for the employee's
  // calendar week, through and including this session - mirrors
  // functions/src/alerts.ts's weekly overtime sweep, which also excludes
  // break time (accumulateWorkedMs).
  weekHoursThroughSession: number;
  assignedSiteNames: string[];
  overrideEventId?: string;
  alerts: Alerts;
  businessHours: { open: string; close: string };
  gracePeriodMinutes: number;
  weeklyOvertimeThreshold: number;
  faceVerification: FaceVerificationSettings;
  // Geofencing/auto-site-detection are Pro-only features, same gate the
  // pre-existing hasGeofenceWarning/hasSiteMismatchWarning booleans used.
  isPro: boolean;
}

export function evaluateSessionWarnings(input: EvaluateSessionWarningsInput): SessionWarning[] {
  const { clockInEvent, clockOutEvent, alerts } = input;
  const warnings: SessionWarning[] = [];

  if (input.overrideEventId) {
    warnings.push(withSeverity("supervisorOverride", { overrideEventId: input.overrideEventId }));
  }

  if (alerts.lateClockInAlert) {
    const inTs = effectiveTimestamp(clockInEvent);
    if (inTs) {
      const expectedMinutes = parseHHMM(input.businessHours.open) + input.gracePeriodMinutes;
      if (minutesOfDay(inTs) > expectedMinutes) {
        warnings.push(withSeverity("lateClockIn", { expectedMinutes, actualTime: inTs }));
      }
    }
  }

  if (alerts.earlyClockOutAlert) {
    const outTs = effectiveTimestamp(clockOutEvent);
    if (outTs) {
      const expectedMinutes = parseHHMM(input.businessHours.close) - input.gracePeriodMinutes;
      if (minutesOfDay(outTs) < expectedMinutes) {
        warnings.push(withSeverity("earlyClockOut", { expectedMinutes, actualTime: outTs }));
      }
    }
  }

  if (alerts.maxHoursWarning && input.hours >= alerts.maxHoursThreshold) {
    warnings.push(withSeverity("maxHours", { hours: input.hours, thresholdHours: alerts.maxHoursThreshold }));
  }

  if (alerts.overtimeWarning && input.weekHoursThroughSession >= input.weeklyOvertimeThreshold) {
    warnings.push(
      withSeverity("overtime", {
        weekHours: input.weekHoursThroughSession,
        thresholdHours: input.weeklyOvertimeThreshold,
      })
    );
  }

  // The only signal a CLOSED session carries of a missed clock-out: a
  // legacy "autoClockOut"-sourced event, written by the old nightly
  // stale-session sweep (now removed - see git history) back when a
  // company had that setting on. Historical events only; nothing creates
  // this source anymore. The "still open" missed-clock-out case is a
  // different, already-working system (the Overview alerts feed) and
  // can't apply to a closed row.
  if (alerts.missedClockOutAlert && clockOutEvent.source === "autoClockOut") {
    const outTs = effectiveTimestamp(clockOutEvent);
    if (outTs) {
      warnings.push(withSeverity("missedClockOut", { note: clockOutEvent.note, actualTime: outTs }));
    }
  }

  if (alerts.maxBreakWarning) {
    const breakMinutes = input.breakHours * 60;
    if (breakMinutes >= alerts.maxBreakMinutes) {
      warnings.push(withSeverity("maxBreak", { breakMinutes, thresholdMinutes: alerts.maxBreakMinutes }));
    }
  }

  // Auto site detection - server already only sets siteMismatch when the
  // employee has at least one assigned site (functions/src/clockEvents.ts),
  // so "no assigned sites = no warning" is already guaranteed upstream.
  if (input.isPro && alerts.siteMismatchWarning && clockInEvent.siteMismatch === true) {
    warnings.push(
      withSeverity("unassignedSite", {
        siteName: clockInEvent.siteName,
        assignedSiteNames: input.assignedSiteNames,
      })
    );
  }

  // Not gated by a settings toggle (there's no "off" for a session with
  // literally no site on it) - same as the pre-existing
  // hasNoSiteDetectedWarning this replaces.
  if (clockInEvent.siteId == null && clockInEvent.geofenceStatus === "outside") {
    warnings.push(withSeverity("noSiteDetected", {}));
  }

  if (input.isPro && alerts.clockedInOutsideGeofence) {
    if (clockInEvent.geofenceStatus === "outside") {
      warnings.push(withSeverity("outsideGeofence", { direction: "in", event: clockInEvent }));
    }
    if (clockOutEvent.geofenceStatus === "outside") {
      warnings.push(withSeverity("outsideGeofence", { direction: "out", event: clockOutEvent }));
    }
  }

  // Face Verification (Pro) - no isPro check needed here: faceCheck is only
  // ever written by functions/src/rekognition.ts for Pro companies, and
  // only once both a clock photo and a usable employee pfp were available
  // (see checkFaceMatch) - its mere presence already means "this check was
  // applicable and ran," so absence is the only suppression needed.
  if (input.faceVerification.alertsEnabled) {
    const directional: [Direction, ClockEvent][] = [
      ["in", clockInEvent],
      ["out", clockOutEvent],
    ];
    for (const [direction, event] of directional) {
      const faceCheck = event.faceCheck;
      if (!faceCheck) continue;

      if (faceCheck.status === "noFace") {
        warnings.push(withSeverity("faceNoFace", { direction, event }));
      } else if (faceCheck.status === "mismatch") {
        if (faceCheck.similarity != null && faceCheck.similarity >= FACE_LOW_CONFIDENCE_FLOOR) {
          warnings.push(withSeverity("faceLowConfidence", { direction, event }));
        } else {
          warnings.push(withSeverity("faceMismatch", { direction, event }));
        }
      }
    }
  }

  return warnings;
}

export function worstSeverity(warnings: SessionWarning[]): WarningSeverity | null {
  if (warnings.some((w) => w.severity === "red")) return "red";
  if (warnings.length > 0) return "yellow";
  return null;
}

// Red first, then yellow - stable within each group (insertion order from
// evaluateSessionWarnings above).
export function sortWarningsBySeverity(warnings: SessionWarning[]): SessionWarning[] {
  return [...warnings].sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "red" ? -1 : 1;
  });
}
