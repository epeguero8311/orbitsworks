"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AppSettings, AttendanceRules } from "@/lib/hooks/useCompanySettings";
import { Toggle } from "@/components/dashboard/settings/Toggle";

export function AppSettingsCard({
  appSettings,
  setAppSettings,
  attendanceRules,
  setAttendanceRules,
}: {
  appSettings: AppSettings;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  attendanceRules: AttendanceRules;
  setAttendanceRules: Dispatch<SetStateAction<AttendanceRules>>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">
        App Settings
      </h2>
      <p className="mt-1 text-xs text-gray-600">
        Controls behavior in the mobile app.
      </p>
      <div className="mt-2 divide-y divide-gray-100">
        <Toggle
          label="Allow supervisor override"
          description="Supervisors can override normal clock-in rules on mobile."
          checked={appSettings.allowSupervisorOverride}
          onChange={(v) =>
            setAppSettings((prev) => ({ ...prev, allowSupervisorOverride: v }))
          }
        />
        <Toggle
          label="Require Reason for Supervisor Overrides"
          description="Require supervisors to provide a reason when overriding an employee's time action."
          checked={attendanceRules.requireOverrideReason}
          onChange={(v) =>
            setAttendanceRules((prev) => ({ ...prev, requireOverrideReason: v }))
          }
        />
      </div>
    </div>
  );
}
