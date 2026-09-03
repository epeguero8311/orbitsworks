"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

export type AttendanceRules = {
  allowEarlyClockIn: boolean;
  allowLateClockOut: boolean;
  autoClockOut: boolean;
  gracePeriodMinutes: number;
};

export type Alerts = {
  maxHoursWarning: boolean;
  maxHoursThreshold: number;
  overtimeWarning: boolean;
  missedClockOutAlert: boolean;
  missedClockOutMinutes: number;
  maxBreakWarning: boolean;
  maxBreakMinutes: number;
};

export type AppSettings = {
  allowSupervisorOverride: boolean;
};

export type CompanySettings = {
  name: string | null;
  logoUrl: string | null;
  businessHours: { open: string; close: string };
  weeklyOvertimeThreshold: number;
  attendanceRules: AttendanceRules;
  alerts: Alerts;
  appSettings: AppSettings;
};

export const DEFAULT_ATTENDANCE_RULES: AttendanceRules = {
  allowEarlyClockIn: true,
  allowLateClockOut: true,
  autoClockOut: false,
  gracePeriodMinutes: 0,
};

export const DEFAULT_ALERTS: Alerts = {
  maxHoursWarning: true,
  maxHoursThreshold: 8,
  overtimeWarning: true,
  missedClockOutAlert: true,
  missedClockOutMinutes: 30,
  maxBreakWarning: true,
  maxBreakMinutes: 15,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  allowSupervisorOverride: true,
};

const DEFAULT_SETTINGS: CompanySettings = {
  name: null,
  logoUrl: null,
  businessHours: { open: "08:00", close: "17:00" },
  weeklyOvertimeThreshold: 40,
  attendanceRules: DEFAULT_ATTENDANCE_RULES,
  alerts: DEFAULT_ALERTS,
  appSettings: DEFAULT_APP_SETTINGS,
};

export function useCompanySettings() {
  const { userData } = useAuth();
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.companyId) return;
    const companyRef = doc(db, "companies", userData.companyId);
    const unsubscribe = onSnapshot(companyRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      setSettings({
        name: data.name ?? null,
        logoUrl: data.logoUrl ?? null,
        businessHours: {
          open: data.businessHours?.open ?? "08:00",
          close: data.businessHours?.close ?? "17:00",
        },
        weeklyOvertimeThreshold: data.weeklyOvertimeThreshold ?? 40,
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
      });
      setLoading(false);
    });
    return unsubscribe;
  }, [userData?.companyId]);

  return { settings, loading };
}