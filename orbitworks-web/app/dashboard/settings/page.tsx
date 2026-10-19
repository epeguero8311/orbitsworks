"use client";

import { Suspense } from "react";
import { useSettingsPage } from "@/lib/hooks/useSettingsPage";
import { useScrollToSettingsAnchor } from "@/lib/hooks/useScrollToSettingsAnchor";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { CompanyProfileCard } from "@/components/dashboard/settings/CompanyProfileCard";
import { BusinessHoursCard } from "@/components/dashboard/settings/BusinessHoursCard";
import { ExportSettingsCard } from "@/components/dashboard/settings/ExportSettingsCard";
import { AutomationsCard } from "@/components/dashboard/settings/AutomationsCard";
import { AlertsCard } from "@/components/dashboard/settings/AlertsCard";
import { AppSettingsCard } from "@/components/dashboard/settings/AppSettingsCard";
import { DevicesCard } from "@/components/dashboard/settings/DevicesCard";
import { SettingsTabBar } from "@/components/dashboard/settings/SettingsTabBar";
import { SettingsSearchBar } from "@/components/dashboard/settings/SettingsSearchBar";

const SETTINGS_PATHNAME = "/dashboard/settings";

// The tab/search hooks below read the URL (useSearchParams), which needs a
// Suspense boundary around it or a production build fails - see Next's own
// useSearchParams docs. useSettingsPage() itself reads no search params, so
// only this inner component, not the whole page, needs to sit inside it.
export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="mt-8 text-sm text-gray-600">Loading...</p>}>
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const s = useSettingsPage();
  const { activeTab, setActiveTab, goToSetting } = useScrollToSettingsAnchor();
  useUnsavedChangesWarning(s.isDirty, SETTINGS_PATHNAME);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950">Settings</h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Manage your company&apos;s account settings.
          </p>
        </div>
        <SettingsSearchBar onSelect={goToSetting} />
      </div>

      <div className="mt-6">
        <SettingsTabBar activeTab={activeTab} onTabChange={setActiveTab} dirtyTabs={s.dirtyTabs} />
      </div>

      {s.loading ? (
        <p className="mt-8 text-sm text-gray-600">Loading...</p>
      ) : (
        <div className="mt-6 max-w-2xl space-y-6 pb-8">
          {activeTab === "general" && (
            <>
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
                gracePeriodMinutes={s.attendanceRules.gracePeriodMinutes}
                onGracePeriodMinutesChange={(v) =>
                  s.setAttendanceRules((prev) => ({ ...prev, gracePeriodMinutes: v }))
                }
              />
            </>
          )}

          {activeTab === "export" && (
            <ExportSettingsCard
              exportSettings={s.exportSettings}
              setExportSettings={s.setExportSettings}
            />
          )}

          {activeTab === "automations" && (
            <AutomationsCard
              exportSettings={s.exportSettings}
              setExportSettings={s.setExportSettings}
              autoClockOut={s.autoClockOut}
              setAutoClockOut={s.setAutoClockOut}
            />
          )}

          {activeTab === "alerts" && (
            <AlertsCard
              alerts={s.alerts}
              setAlerts={s.setAlerts}
              otThreshold={s.otThreshold}
              setOtThreshold={s.setOtThreshold}
              otMultiplier={s.otMultiplier}
              setOtMultiplier={s.setOtMultiplier}
              isPro={s.isPro}
              faceVerification={s.faceVerification}
              onFaceVerificationChange={s.setFaceVerification}
            />
          )}

          {activeTab === "mobile" && (
            <>
              <AppSettingsCard
                appSettings={s.appSettings}
                setAppSettings={s.setAppSettings}
                attendanceRules={s.attendanceRules}
                setAttendanceRules={s.setAttendanceRules}
              />

              <DevicesCard isPro={s.isPro} />
            </>
          )}
        </div>
      )}

      {!s.loading && (
        <div className="sticky bottom-0 -mx-4 mt-6 border-t border-gray-200 bg-white px-4 py-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="max-w-2xl">
            {s.error && <p className="mb-3 text-sm text-red-600">{s.error}</p>}
            {s.success && <p className="mb-3 text-sm text-green-700">{s.success}</p>}
            <button
              onClick={s.handleSave}
              disabled={s.isSaving}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {s.isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
