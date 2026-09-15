"use client";

import { useSettingsPage } from "@/lib/hooks/useSettingsPage";
import { CompanyProfileCard } from "@/components/dashboard/settings/CompanyProfileCard";
import { BusinessHoursCard } from "@/components/dashboard/settings/BusinessHoursCard";
import { AttendanceRulesCard } from "@/components/dashboard/settings/AttendanceRulesCard";
import { AlertsCard } from "@/components/dashboard/settings/AlertsCard";
import { AppSettingsCard } from "@/components/dashboard/settings/AppSettingsCard";

export default function SettingsPage() {
  const s = useSettingsPage();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-950">Settings</h1>
      <p className="mt-1.5 text-sm text-gray-600">
        Manage your company&apos;s account settings.
      </p>

      {s.loading ? (
        <p className="mt-8 text-sm text-gray-600">Loading...</p>
      ) : (
        <div className="mt-8 max-w-2xl space-y-6">
          <CompanyProfileCard
            companyName={s.companyName}
            onCompanyNameChange={s.setCompanyName}
            logoUrl={s.logoUrl}
            logoPreview={s.logoPreview}
            onLogoChange={s.handleLogoChange}
          />

          <BusinessHoursCard
            businessOpen={s.businessOpen}
            onBusinessOpenChange={s.setBusinessOpen}
            businessClose={s.businessClose}
            onBusinessCloseChange={s.setBusinessClose}
          />

          <AttendanceRulesCard
            attendanceRules={s.attendanceRules}
            setAttendanceRules={s.setAttendanceRules}
          />

          <AlertsCard
            alerts={s.alerts}
            setAlerts={s.setAlerts}
            otThreshold={s.otThreshold}
            setOtThreshold={s.setOtThreshold}
          />

          <AppSettingsCard
            appSettings={s.appSettings}
            setAppSettings={s.setAppSettings}
            attendanceRules={s.attendanceRules}
            setAttendanceRules={s.setAttendanceRules}
          />

          {s.error && <p className="text-sm text-red-600">{s.error}</p>}
          {s.success && <p className="text-sm text-green-700">{s.success}</p>}

          <button
            onClick={s.handleSave}
            disabled={s.isSaving}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {s.isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
