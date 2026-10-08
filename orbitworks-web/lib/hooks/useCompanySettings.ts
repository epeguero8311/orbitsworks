"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { isProPlan } from "@/lib/stripe/tiers";
import type { ExportSettings } from "@/lib/types";

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
  attendanceRules: AttendanceRules;
  alerts: Alerts;
  appSettings: AppSettings;
  exportSettings: ExportSettings;
  faceVerification: FaceVerificationSettings;
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
  attendanceRules: DEFAULT_ATTENDANCE_RULES,
  alerts: DEFAULT_ALERTS,
  appSettings: DEFAULT_APP_SETTINGS,
  exportSettings: DEFAULT_EXPORT_SETTINGS,
  faceVerification: DEFAULT_FACE_VERIFICATION_SETTINGS,
};

export function useCompanySettings() {
  const { userData } = useAuth();
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      setIsPro(isProPlan(data.planTier as string | undefined));
      setSettings({
        name: data.name ?? null,
        logoUrl: data.logoUrl ?? null,
        businessHours: {
          open: data.businessHours?.open ?? "08:00",
          close: data.businessHours?.close ?? "17:00",
        },
        weeklyOvertimeThreshold: data.weeklyOvertimeThreshold ?? 40,
        overtimeMultiplier: data.overtimeMultiplier ?? 1.5,
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
      });
      setLoading(false);
    });
    return unsubscribe;
  }, [userData?.companyId]);

  return { settings, isPro, loading };
}