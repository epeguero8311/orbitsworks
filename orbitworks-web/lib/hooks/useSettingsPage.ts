"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { isProPlan } from "@/lib/stripe/tiers";
import {
  AttendanceRules,
  Alerts,
  AppSettings,
  FaceVerificationSettings,
  AutoClockOutSettings,
  DEFAULT_ATTENDANCE_RULES,
  DEFAULT_ALERTS,
  DEFAULT_APP_SETTINGS,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_FACE_VERIFICATION_SETTINGS,
  DEFAULT_AUTO_CLOCK_OUT,
} from "@/lib/hooks/useCompanySettings";
import type { SettingsTabId } from "@/lib/hooks/useSettingsTabs";
import type { ExportSettings } from "@/lib/types";

export type AuthMode = "individual" | "shared";

// The subset of useSettingsPage's state that the Save button actually
// persists and that the tabbed Settings UI needs to diff against, to know
// which tabs have unsaved edits. Captured once right after load (and again
// right after a successful save) - see originalSnapshotRef below.
type SettingsSnapshot = {
  companyName: string;
  businessOpen: string;
  businessClose: string;
  otThreshold: string;
  otMultiplier: string;
  attendanceRules: AttendanceRules;
  alerts: Alerts;
  appSettings: AppSettings;
  exportSettings: ExportSettings;
  faceVerification: FaceVerificationSettings;
  autoClockOut: AutoClockOutSettings;
};

// Field-to-tab mapping for the dirty dot on each tab (SettingsTabBar.tsx).
// attendanceRules and exportSettings are each a single saved object whose
// individual fields are split across two tabs (gracePeriodMinutes lives on
// General, requireOverrideReason on Mobile App; the rounding fields are
// Export Settings, the break/shift fields are Automations) - diffed at the
// field level for that reason, not the object level. alerts/appSettings
// are flat objects of booleans/numbers, safe to diff with JSON.stringify.
function computeDirtyTabs(
  current: SettingsSnapshot,
  original: SettingsSnapshot | null,
  hasLogoChange: boolean
): Set<SettingsTabId> {
  const dirty = new Set<SettingsTabId>();
  if (!original) return dirty;

  if (
    current.companyName !== original.companyName ||
    hasLogoChange ||
    current.businessOpen !== original.businessOpen ||
    current.businessClose !== original.businessClose ||
    current.attendanceRules.gracePeriodMinutes !== original.attendanceRules.gracePeriodMinutes
  ) {
    dirty.add("general");
  }

  if (
    current.exportSettings.roundDailyMinutes !== original.exportSettings.roundDailyMinutes ||
    current.exportSettings.roundTotalMinutes !== original.exportSettings.roundTotalMinutes
  ) {
    dirty.add("export");
  }

  if (
    current.exportSettings.automaticBreakMinutes !== original.exportSettings.automaticBreakMinutes ||
    current.exportSettings.minimumShiftHours !== original.exportSettings.minimumShiftHours ||
    current.autoClockOut.enabled !== original.autoClockOut.enabled ||
    current.autoClockOut.maxWorkedHours !== original.autoClockOut.maxWorkedHours
  ) {
    dirty.add("automations");
  }

  if (
    JSON.stringify(current.alerts) !== JSON.stringify(original.alerts) ||
    current.otThreshold !== original.otThreshold ||
    current.otMultiplier !== original.otMultiplier ||
    current.faceVerification.alertsEnabled !== original.faceVerification.alertsEnabled
  ) {
    dirty.add("alerts");
  }

  if (
    JSON.stringify(current.appSettings) !== JSON.stringify(original.appSettings) ||
    current.attendanceRules.requireOverrideReason !== original.attendanceRules.requireOverrideReason
  ) {
    dirty.add("mobile");
  }

  return dirty;
}

export function useSettingsPage() {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(true);

  const [companyName, setCompanyName] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("individual");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [businessOpen, setBusinessOpen] = useState("08:00");
  const [businessClose, setBusinessClose] = useState("17:00");
  const [otThreshold, setOtThreshold] = useState("40");
  const [otMultiplier, setOtMultiplier] = useState("1.5");
  const [attendanceRules, setAttendanceRules] = useState<AttendanceRules>(
    DEFAULT_ATTENDANCE_RULES
  );
  const [alerts, setAlerts] = useState<Alerts>(DEFAULT_ALERTS);
  const [appSettings, setAppSettings] = useState<AppSettings>(
    DEFAULT_APP_SETTINGS
  );
  const [isPro, setIsPro] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(
    DEFAULT_EXPORT_SETTINGS
  );
  const [faceVerification, setFaceVerification] = useState<FaceVerificationSettings>(
    DEFAULT_FACE_VERIFICATION_SETTINGS
  );
  const [autoClockOut, setAutoClockOut] = useState<AutoClockOutSettings>(
    DEFAULT_AUTO_CLOCK_OUT
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Captured once right after load, and again right after a successful
  // save - the "clean" baseline computeDirtyTabs diffs the live state
  // against below.
  const [originalSnapshot, setOriginalSnapshot] = useState<SettingsSnapshot | null>(null);

  useEffect(() => {
    if (!userData?.companyId) return;

    async function loadCompany() {
      try {
        const companyRef = doc(db, "companies", userData!.companyId);
        const snapshot = await getDoc(companyRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          const resolved: SettingsSnapshot = {
            companyName: data.name ?? "",
            businessOpen: data.businessHours?.open ?? "08:00",
            businessClose: data.businessHours?.close ?? "17:00",
            otThreshold:
              data.weeklyOvertimeThreshold != null
                ? String(data.weeklyOvertimeThreshold)
                : "40",
            otMultiplier:
              data.overtimeMultiplier != null ? String(data.overtimeMultiplier) : "1.5",
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
          };

          setCompanyName(resolved.companyName);
          setAuthMode((data.authMode as AuthMode) ?? "individual");
          setLogoUrl(data.logoUrl ?? null);
          setBusinessOpen(resolved.businessOpen);
          setBusinessClose(resolved.businessClose);
          setOtThreshold(resolved.otThreshold);
          setOtMultiplier(resolved.otMultiplier);
          setAttendanceRules(resolved.attendanceRules);
          setAlerts(resolved.alerts);
          setAppSettings(resolved.appSettings);
          setIsPro(isProPlan(data.planTier));
          setExportSettings(resolved.exportSettings);
          setFaceVerification(resolved.faceVerification);
          setAutoClockOut(resolved.autoClockOut);

          setOriginalSnapshot(resolved);
        }
      } catch (err) {
        console.error("Load company error:", err);
        setError("Couldn't load company settings.");
      } finally {
        setLoading(false);
      }
    }

    loadCompany();
  }, [userData?.companyId]);

  function handleLogoChange(file: File | null) {
    setLogoFile(file);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSave() {
    if (!userData?.companyId) return;
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const companyRef = doc(db, "companies", userData.companyId);

      let newLogoUrl = logoUrl;
      if (logoFile) {
        const logoRef = ref(
          storage,
          `companies/${userData.companyId}/logo.jpg`
        );
        await uploadBytes(logoRef, logoFile);
        newLogoUrl = await getDownloadURL(logoRef);
      }

      await updateDoc(companyRef, {
        name: companyName.trim(),
        authMode,
        logoUrl: newLogoUrl,
        businessHours: {
          open: businessOpen,
          close: businessClose,
        },
        weeklyOvertimeThreshold: otThreshold.trim()
          ? parseFloat(otThreshold.trim())
          : 40,
        overtimeMultiplier: otMultiplier.trim() ? parseFloat(otMultiplier.trim()) : 1.5,
        attendanceRules,
        alerts,
        appSettings,
        exportSettings,
        // Face Verification is Pro-only, and firestore.rules enforces that:
        // it denies the WHOLE update if faceVerification is among the
        // affected keys on a non-Pro company's doc. A non-Pro company has
        // never had this field saved at all, so writing even its unchanged
        // default would "add" the key and trip that denial - blocking
        // every other field in this same save, not just this one. Omitting
        // it entirely for non-Pro companies is what keeps every other
        // Settings tab saveable on every plan, Free included.
        ...(isPro ? { faceVerification } : {}),
        autoClockOut,
      });

      setLogoUrl(newLogoUrl);
      setLogoFile(null);
      setLogoPreview(null);
      setSuccess("Saved.");

      // Clears every tab's dirty dot - this save just persisted exactly
      // this snapshot, so it's the new "clean" baseline to diff against.
      setOriginalSnapshot({
        companyName,
        businessOpen,
        businessClose,
        otThreshold,
        otMultiplier,
        attendanceRules,
        alerts,
        appSettings,
        exportSettings,
        faceVerification,
        autoClockOut,
      });
    } catch (err) {
      console.error("Save company error:", err);
      setError("Couldn't save changes. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const dirtyTabs = computeDirtyTabs(
    {
      companyName,
      businessOpen,
      businessClose,
      otThreshold,
      otMultiplier,
      attendanceRules,
      alerts,
      appSettings,
      exportSettings,
      faceVerification,
      autoClockOut,
    },
    originalSnapshot,
    logoFile !== null
  );
  const isDirty = dirtyTabs.size > 0;

  return {
    loading,
    dirtyTabs,
    isDirty,
    companyName,
    setCompanyName,
    logoUrl,
    logoPreview,
    handleLogoChange,
    businessOpen,
    setBusinessOpen,
    businessClose,
    setBusinessClose,
    otThreshold,
    setOtThreshold,
    otMultiplier,
    setOtMultiplier,
    attendanceRules,
    setAttendanceRules,
    alerts,
    setAlerts,
    appSettings,
    setAppSettings,
    isPro,
    exportSettings,
    setExportSettings,
    faceVerification,
    setFaceVerification,
    autoClockOut,
    setAutoClockOut,
    isSaving,
    error,
    success,
    handleSave,
  };
}
