"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { isCoreOrProPlan, isProPlan } from "@/lib/stripe/tiers";
import type { ExportSettings, RoundingIncrement } from "@/lib/types";
import { DEFAULT_OVERTIME_TIME_ZONE, type OvertimeSettings } from "@/lib/overtime";
import { readSavedApprovalsColumns, type OptionalApprovalsColumnKey } from "@/lib/approvalsColumns";

export type AttendanceRules = {
  gracePeriodMinutes: number;
  requireOverrideReason: boolean;
};

export type Alerts = {
  maxHoursWarning: boolean;
  maxHoursThreshold: number;
  overtimeWarning: boolean;
  missedClockOutAlert: boolean;
  missedClockOutMinutes: number;
  maxBreakWarning: boolean;
  maxBreakMinutes: number;
  // Controls the "Clocked in outside geofence" alert (see AlertsCard).
  // Geofence enforcement itself is always flag-only - this toggle is the
  // only knob left.
  clockedInOutsideGeofence: boolean;
  // Auto site detection - fires when a clock-in's detected site isn't one
  // of the employee's own assignedSiteIds. Info-only, never blocks (see
  // dashboardOverviewUtils.ts's siteMismatch alert).
  siteMismatchWarning: boolean;
  // Mobile launch alerts (see functions/src/alerts.ts). Both are anchored
  // to businessHours.open/close + attendanceRules.gracePeriodMinutes - no
  // separate threshold needed for either.
  lateClockInAlert: boolean;
  earlyClockOutAlert: boolean;
  // Employee App Phase 8 (Pro): "Left the job site" - the Overview /
  // supervisor app feed entry and the red Timesheet Approvals warning.
  // Default on. Leaving never blocks anything. Mirrors
  // functions/src/alerts.ts ALERT_SETTINGS_DEFAULTS.leftJobSiteAlert.
  leftJobSiteAlert: boolean;
  // Face Verification (Pro) sub-toggles under "Face recognition alerts"
  // (faceVerification.alertsEnabled, the main switch). Default on. Mirror
  // ALERT_SETTINGS_DEFAULTS in functions/src/alerts.ts. faceNoFaceAlert
  // also controls the employee's own "Couldn't detect a face" message.
  faceMismatchAlert: boolean;
  faceNoFaceAlert: boolean;
};

export type AppSettings = {
  allowSupervisorOverride: boolean;
  // Gates the mobile app's Create Employee flow (see createEmployee in
  // functions/src/createEmployee.ts, which also enforces this server-side) -
  // when off, the button doesn't even show on mobile.
  allowAppEmployeeCreate: boolean;
  // Gates the mobile app's Update Employee flow (see updateEmployeeProfile in
  // functions/src/updateEmployee.ts, which also enforces this server-side) -
  // independent of allowAppEmployeeCreate, defaulted the same way.
  allowAppEmployeeUpdate: boolean;
  // Company-wide policy (replaced a per-device AsyncStorage toggle on
  // mobile) - when on, clock-in without Pro geofencing auto-detection
  // picks the employee's own assigned site instead of trusting whatever
  // site is selected on the device (see ClockCameraScreen.js on mobile).
  askJobSiteEachTime: boolean;
};

export type CompanySettings = {
  name: string | null;
  logoUrl: string | null;
  businessHours: { open: string; close: string };
  weeklyOvertimeThreshold: number;
  overtimeMultiplier: number;
  // Overtime (Task 1) - top-level, next to the two fields above (no
  // migration). See OvertimeFields below.
  overtimeEnabled: boolean;
  dailyOvertimeThreshold: number;
  overtimeWeekStartsOn: OvertimeWeekday;
  overtimeRoundMinutes: RoundingIncrement;
  // One time zone for every day/week boundary in overtime math: the
  // company's timezone field if it has one, else America/Chicago (same
  // fallback the server uses, functions/src/shared.ts COMPANY_TIMEZONE).
  timeZone: string;
  attendanceRules: AttendanceRules;
  alerts: Alerts;
  appSettings: AppSettings;
  exportSettings: ExportSettings;
  faceVerification: FaceVerificationSettings;
  autoClockOut: AutoClockOutSettings;
  // Approve Hours Columns (Task 2): the saved OPTIONAL column keys, or null
  // when the company never saved a choice (= today's default columns).
  // Top-level company field; see lib/approvalsColumns.ts.
  approvalsColumns: OptionalApprovalsColumnKey[] | null;
  // Tips (Task 3): Export Settings toggle, top-level company field, default
  // OFF. OFF = no Tips field in the shift modal, no Tips column anywhere,
  // tips left out of every export; saved tips are kept (decision D7).
  tipsEnabled: boolean;
};

// Overtime (Task 1), Settings > Export Settings. Stored top-level on the
// company doc next to weeklyOvertimeThreshold / overtimeMultiplier, which
// keep their names and existing values (the inputs just moved from Alerts
// to Export Settings). Overtime is OFF by default, so a company that has
// never saved these fields sees no change anywhere. weeklyOvertimeThreshold
// still drives the Overtime warning even while overtimeEnabled is false.
// Firestore rules type-check these four on write; the client validates
// them with lib/validators/overtimeSettings.ts before saving.
export type OvertimeWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type OvertimeFields = {
  overtimeEnabled: boolean;
  // 0 = daily overtime off.
  dailyOvertimeThreshold: number;
  overtimeWeekStartsOn: OvertimeWeekday;
  // Same 0/5/15/30 options as the other rounding settings, always rounds
  // up, applied per day.
  overtimeRoundMinutes: RoundingIncrement;
};

export const DEFAULT_OVERTIME_FIELDS: OvertimeFields = {
  overtimeEnabled: false,
  dailyOvertimeThreshold: 0,
  overtimeWeekStartsOn: 1,
  overtimeRoundMinutes: 0,
};

const ROUNDING_INCREMENTS: readonly number[] = [0, 5, 15, 30];

// Reads the four Overtime fields off raw company doc data, falling back to
// the defaults for anything missing or malformed.
export function resolveOvertimeFields(data: Record<string, unknown>): OvertimeFields {
  const weekday = data.overtimeWeekStartsOn;
  const round = data.overtimeRoundMinutes;
  const daily = data.dailyOvertimeThreshold;
  return {
    overtimeEnabled: data.overtimeEnabled === true,
    dailyOvertimeThreshold:
      typeof daily === "number" && Number.isFinite(daily) && daily >= 0
        ? daily
        : DEFAULT_OVERTIME_FIELDS.dailyOvertimeThreshold,
    overtimeWeekStartsOn:
      typeof weekday === "number" && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
        ? (weekday as OvertimeWeekday)
        : DEFAULT_OVERTIME_FIELDS.overtimeWeekStartsOn,
    overtimeRoundMinutes:
      typeof round === "number" && ROUNDING_INCREMENTS.includes(round)
        ? (round as RoundingIncrement)
        : DEFAULT_OVERTIME_FIELDS.overtimeRoundMinutes,
  };
}

// The shared overtime function's settings, from the company's settings.
export function overtimeSettingsFrom(settings: CompanySettings): OvertimeSettings {
  return {
    enabled: settings.overtimeEnabled,
    weeklyThresholdHours: settings.weeklyOvertimeThreshold,
    dailyThresholdHours: settings.dailyOvertimeThreshold,
    weekStartsOn: settings.overtimeWeekStartsOn,
    multiplier: settings.overtimeMultiplier,
    roundOvertimeMinutes: settings.overtimeRoundMinutes,
    automaticBreakMinutes: settings.exportSettings.automaticBreakMinutes,
    minimumShiftHours: settings.exportSettings.minimumShiftHours,
    timeZone: settings.timeZone,
  };
}

// Automations > Auto clock-out. Available on every plan, off by default.
// Read server-side by the scheduled auto-clock-out sweep (functions/src/
// autoClockOut.ts) directly off the company doc - not through this hook,
// which is client-only - so keep the field names in sync manually if
// either side changes.
export type AutoClockOutSettings = {
  enabled: boolean;
  maxWorkedHours: number;
};

export const DEFAULT_AUTO_CLOCK_OUT: AutoClockOutSettings = {
  enabled: false,
  maxWorkedHours: 12,
};

export const DEFAULT_ATTENDANCE_RULES: AttendanceRules = {
  gracePeriodMinutes: 0,
  requireOverrideReason: true,
};

export const DEFAULT_ALERTS: Alerts = {
  maxHoursWarning: true,
  maxHoursThreshold: 8,
  overtimeWarning: true,
  missedClockOutAlert: true,
  missedClockOutMinutes: 30,
  maxBreakWarning: true,
  maxBreakMinutes: 15,
  clockedInOutsideGeofence: true,
  siteMismatchWarning: true,
  lateClockInAlert: true,
  earlyClockOutAlert: true,
  leftJobSiteAlert: true,
  faceMismatchAlert: true,
  faceNoFaceAlert: true,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  allowSupervisorOverride: true,
  allowAppEmployeeCreate: true,
  allowAppEmployeeUpdate: true,
  askJobSiteEachTime: true,
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  roundDailyMinutes: 0,
  roundTotalMinutes: 0,
  automaticBreakMinutes: 0,
  minimumShiftHours: 0,
};

// Face Verification (Pro) - checks always run for every Pro company, no
// opt-out. alertsEnabled is the only remaining knob: true (default) means
// faceMismatch/faceNoFace alerts fire as usual; false still runs the check
// and still saves faceCheck on the clock event (badges keep working), it
// just skips creating those two alert types and their push. The bad
// reference-photo alert is unaffected either way - see
// functions/src/alerts.ts.
export type FaceVerificationSettings = {
  alertsEnabled: boolean;
};

export const DEFAULT_FACE_VERIFICATION_SETTINGS: FaceVerificationSettings = {
  alertsEnabled: true,
};

const DEFAULT_SETTINGS: CompanySettings = {
  name: null,
  logoUrl: null,
  businessHours: { open: "08:00", close: "17:00" },
  weeklyOvertimeThreshold: 40,
  overtimeMultiplier: 1.5,
  ...DEFAULT_OVERTIME_FIELDS,
  timeZone: DEFAULT_OVERTIME_TIME_ZONE,
  attendanceRules: DEFAULT_ATTENDANCE_RULES,
  alerts: DEFAULT_ALERTS,
  appSettings: DEFAULT_APP_SETTINGS,
  exportSettings: DEFAULT_EXPORT_SETTINGS,
  faceVerification: DEFAULT_FACE_VERIFICATION_SETTINGS,
  autoClockOut: DEFAULT_AUTO_CLOCK_OUT,
  approvalsColumns: null,
  tipsEnabled: false,
};

export function useCompanySettings() {
  const { userData } = useAuth();
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [isPro, setIsPro] = useState(false);
  // Email invites (Phase 3B): Core or Pro, not past_due. Same rule as the
  // server's companyCanUseInvites; the server still enforces it.
  const [canUseInvites, setCanUseInvites] = useState(false);
  // Phase 9 (H2/H3): the one invite form's plan state - seats from the
  // company doc (employeeCap from the plan, activeEmployeeCount from
  // onEmployeeWrite), same source as crew codes (lib/joinCodes/server.ts).
  const [plan, setPlan] = useState<{ pastDue: boolean; activeCap: number | null; activeCount: number }>({ pastDue: false, activeCap: null, activeCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      setIsPro(isProPlan(data.planTier as string | undefined));
      setCanUseInvites(isCoreOrProPlan(data.planTier as string | undefined) && data.subscriptionStatus !== "past_due");
      setPlan({
        pastDue: data.subscriptionStatus === "past_due",
        activeCap: typeof data.employeeCap === "number" ? data.employeeCap : null,
        activeCount: typeof data.activeEmployeeCount === "number" ? data.activeEmployeeCount : 0,
      });
      setSettings({
        name: data.name ?? null,
        logoUrl: data.logoUrl ?? null,
        businessHours: {
          open: data.businessHours?.open ?? "08:00",
          close: data.businessHours?.close ?? "17:00",
        },
        weeklyOvertimeThreshold: data.weeklyOvertimeThreshold ?? 40,
        overtimeMultiplier: data.overtimeMultiplier ?? 1.5,
        ...resolveOvertimeFields(data),
        timeZone:
          typeof data.timezone === "string" && data.timezone ? data.timezone : DEFAULT_OVERTIME_TIME_ZONE,
        attendanceRules: {
          ...DEFAULT_ATTENDANCE_RULES,
          ...(data.attendanceRules ?? {}),
        },
        alerts: {
          ...DEFAULT_ALERTS,
          ...(data.alerts ?? {}),
        },
        appSettings: {
          ...DEFAULT_APP_SETTINGS,
          ...(data.appSettings ?? {}),
        },
        exportSettings: {
          ...DEFAULT_EXPORT_SETTINGS,
          ...(data.exportSettings ?? {}),
        },
        faceVerification: {
          ...DEFAULT_FACE_VERIFICATION_SETTINGS,
          ...(data.faceVerification ?? {}),
        },
        autoClockOut: {
          ...DEFAULT_AUTO_CLOCK_OUT,
          ...(data.autoClockOut ?? {}),
        },
        approvalsColumns: readSavedApprovalsColumns(data.approvalsColumns),
        tipsEnabled: data.tipsEnabled === true,
      });
      setLoading(false);
    });
    return unsubscribe;
  }, [userData?.companyId]);

  const seatsLeft = plan.activeCap === null ? null : Math.max(0, plan.activeCap - plan.activeCount);
  return { settings, isPro, canUseInvites, loading, pastDue: plan.pastDue, activeCap: plan.activeCap, seatsLeft };
}