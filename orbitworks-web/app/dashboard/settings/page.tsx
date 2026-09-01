"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  AttendanceRules,
  Alerts,
  DEFAULT_ATTENDANCE_RULES,
  DEFAULT_ALERTS,
} from "@/lib/hooks/useCompanySettings";

type AuthMode = "individual" | "shared";

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="pr-4">
        <p className="text-sm font-medium text-gray-950">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-gray-600">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function ThresholdField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 pb-3.5">
      <label className="text-xs text-gray-600">{label}</label>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : 0)}
        className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
      <span className="text-xs text-gray-600">{suffix}</span>
    </div>
  );
}

export default function SettingsPage() {
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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-950">Settings</h1>
      <p className="mt-1.5 text-sm text-gray-600">
        Manage your company's account settings.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-gray-600">Loading...</p>
      ) : (
        <div className="mt-8 max-w-2xl space-y-6">
          {/* Company profile */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-950">
              Company profile
            </h2>

            <div className="mt-5 flex items-center gap-4">
              {logoPreview || logoUrl ? (
                <img
                  src={logoPreview ?? logoUrl ?? undefined}
                  alt="Company logo"
                  className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-600">
                  No logo
                </div>
              )}
              <div>
                <label
                  htmlFor="companyLogo"
                  className="cursor-pointer rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-950 hover:border-gray-300"
                >
                  {logoUrl ? "Change logo" : "Upload logo"}
                </label>
                <input
                  id="companyLogo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </div>
            </div>

            <div className="mt-5">
              <label
                htmlFor="companyName"
                className="mb-2 block text-sm font-medium text-gray-950"
              >
                Company name
              </label>
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Business hours */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-950">
              Business hours
            </h2>
            <p className="mt-1 text-xs text-gray-600">
              Applies company-wide for now.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="time"
                value={businessOpen}
                onChange={(e) => setBusinessOpen(e.target.value)}
                className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <span className="text-sm text-gray-600">to</span>
              <input
                type="time"
                value={businessClose}
                onChange={(e) => setBusinessClose(e.target.value)}
                className="rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Time & Attendance Rules */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-950">
              Time & Attendance Rules
            </h2>
            <p className="mt-1 text-xs text-gray-600">
              These are on/off for now - the actual enforcement gets wired up
              once the mobile clock-in flow is built.
            </p>

            <div className="mt-5">
              <label
                htmlFor="gracePeriod"
                className="mb-2 block text-sm font-medium text-gray-950"
              >
                Grace period (minutes)
              </label>
              <input
                id="gracePeriod"
                type="number"
                min="0"
                step="1"
                value={attendanceRules.gracePeriodMinutes}
                onChange={(e) =>
                  setAttendanceRules((prev) => ({
                    ...prev,
                    gracePeriodMinutes: e.target.value
                      ? parseInt(e.target.value, 10)
                      : 0,
                  }))
                }
                className="w-32 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <p className="mt-2 text-xs text-gray-600">
                Minutes after the scheduled start time before a clock-in
                counts as late. E.g. a 5 minute grace period on an 8:00 start
                means 8:05 still counts as on time, 8:06 counts as late.
              </p>
            </div>

            <div className="mt-2 divide-y divide-gray-100">
              <Toggle
                label="Allow early clock in"
                description="Employees can clock in before their scheduled start time."
                checked={attendanceRules.allowEarlyClockIn}
                onChange={(v) =>
                  setAttendanceRules((prev) => ({ ...prev, allowEarlyClockIn: v }))
                }
              />
              <Toggle
                label="Allow late clock out"
                description="Employees can clock out after their scheduled end time."
                checked={attendanceRules.allowLateClockOut}
                onChange={(v) =>
                  setAttendanceRules((prev) => ({ ...prev, allowLateClockOut: v }))
                }
              />
              <Toggle
                label="Auto clock out"
                description="Automatically clock out employees who forget to."
                checked={attendanceRules.autoClockOut}
                onChange={(v) =>
                  setAttendanceRules((prev) => ({ ...prev, autoClockOut: v }))
                }
              />
            </div>
          </div>

          {/* Alerts */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-950">Alerts</h2>
            <p className="mt-1 text-xs text-gray-600">
              Choose which alerts you want to see on the Overview dashboard.
            </p>
            <div className="mt-2 divide-y divide-gray-100">
              <div className="py-1">
                <Toggle
                  label="Max hours warning"
                  checked={alerts.maxHoursWarning}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, maxHoursWarning: v }))}
                />
                <ThresholdField
                  label="Warning at:"
                  suffix="hours"
                  value={alerts.maxHoursThreshold}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, maxHoursThreshold: v }))}
                />
              </div>

              <div className="py-1">
                <Toggle
                  label="Overtime warning"
                  checked={alerts.overtimeWarning}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, overtimeWarning: v }))}
                />
                <ThresholdField
                  label="Warning at:"
                  suffix="hours/week"
                  value={otThreshold ? parseFloat(otThreshold) : 40}
                  onChange={(v) => setOtThreshold(String(v))}
                />
              </div>

              <div className="py-1">
                <Toggle
                  label="Missed clock out alert"
                  checked={alerts.missedClockOutAlert}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, missedClockOutAlert: v }))}
                />
                <ThresholdField
                  label="Alert after:"
                  suffix="minutes"
                  value={alerts.missedClockOutMinutes}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, missedClockOutMinutes: v }))}
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-700">{success}</p>}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}