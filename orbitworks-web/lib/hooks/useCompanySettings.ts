"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { isProPlan } from "@/lib/stripe/tiers";

export type AttendanceRules = {
  allowEarlyClockIn: boolean;
  allowLateClockOut: boolean;
  autoClockOut: boolean;
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
  // Alert logic itself ships in Part 4 of Geofencing - this is just the
  // saved preference for now (see GeofencingCard, AlertsCard).
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
};

// Geofencing (Pro) Part 2 - company-wide enforcement mode. Clock-outs are
// never affected by any mode; only flagged, never blocked (see
// GeofencingCard's always-shown note). Read by clock-in enforcement in
// Part 3 and the alert in Part 4 - this module is the shared read model
// for both the Settings form and those later consumers.
export type EnforcementMode = "flag" | "requireReason" | "block";

export type GeofencingSettings = {
  enforcementMode: EnforcementMode;
};

export const ENFORCEMENT_MODE_OPTIONS: {
  value: EnforcementMode;
  label: string;
  description: string;
}[] = [
  {
    value: "flag",
    label: "Flag only",
    description: "Clock-in goes through and is marked as outside the geofence.",
  },
  {
    value: "requireReason",
    label: "Require reason",
    description:
      "The worker must type a reason before the clock-in goes through; it's still flagged.",
  },
  {
    value: "block",
    label: "Block",
    description: "Clock-in is denied unless a supervisor overrides it.",
  },
];

export type CompanySettings = {
  name: string | null;
  logoUrl: string | null;
  businessHours: { open: string; close: string };
  weeklyOvertimeThreshold: number;
  overtimeMultiplier: number;
  attendanceRules: AttendanceRules;
  alerts: Alerts;
  appSettings: AppSettings;
  geofencing: GeofencingSettings;
};

export const DEFAULT_ATTENDANCE_RULES: AttendanceRules = {
  allowEarlyClockIn: true,
  allowLateClockOut: true,
  autoClockOut: false,
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
};

// Existing companies with no saved geofencing value behave as "Flag only"
// - see the CompanySettings.geofencing merge below and in useSettingsPage.
export const DEFAULT_GEOFENCING_SETTINGS: GeofencingSettings = {
  enforcementMode: "flag",
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
  geofencing: DEFAULT_GEOFENCING_SETTINGS,
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
        geofencing: {
          ...DEFAULT_GEOFENCING_SETTINGS,
          ...(data.geofencing ?? {}),
        },
      });
      setLoading(false);
    });
    return unsubscribe;
  }, [userData?.companyId]);

  return { settings, isPro, loading };
}