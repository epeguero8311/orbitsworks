"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  AttendanceRules,
  Alerts,
  AppSettings,
  DEFAULT_ATTENDANCE_RULES,
  DEFAULT_ALERTS,
  DEFAULT_APP_SETTINGS,
} from "@/lib/hooks/useCompanySettings";

export type AuthMode = "individual" | "shared";

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
  const [attendanceRules, setAttendanceRules] = useState<AttendanceRules>(
    DEFAULT_ATTENDANCE_RULES
  );
  const [alerts, setAlerts] = useState<Alerts>(DEFAULT_ALERTS);
  const [appSettings, setAppSettings] = useState<AppSettings>(
    DEFAULT_APP_SETTINGS
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!userData?.companyId) return;

    async function loadCompany() {
      try {
        const companyRef = doc(db, "companies", userData!.companyId);
        const snapshot = await getDoc(companyRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          setCompanyName(data.name ?? "");
          setAuthMode((data.authMode as AuthMode) ?? "individual");
          setLogoUrl(data.logoUrl ?? null);
          setBusinessOpen(data.businessHours?.open ?? "08:00");
          setBusinessClose(data.businessHours?.close ?? "17:00");
          setOtThreshold(
            data.weeklyOvertimeThreshold != null
              ? String(data.weeklyOvertimeThreshold)
              : "40"
          );
          setAttendanceRules({
            ...DEFAULT_ATTENDANCE_RULES,
            ...(data.attendanceRules ?? {}),
          });
          setAlerts({
            ...DEFAULT_ALERTS,
            ...(data.alerts ?? {}),
          });
          setAppSettings({
            ...DEFAULT_APP_SETTINGS,
            ...(data.appSettings ?? {}),
          });
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
        attendanceRules,
        alerts,
        appSettings,
      });

      setLogoUrl(newLogoUrl);
      setLogoFile(null);
      setLogoPreview(null);
      setSuccess("Saved.");
    } catch (err) {
      console.error("Save company error:", err);
      setError("Couldn't save changes. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return {
    loading,
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
    attendanceRules,
    setAttendanceRules,
    alerts,
    setAlerts,
    appSettings,
    setAppSettings,
    isSaving,
    error,
    success,
    handleSave,
  };
}
