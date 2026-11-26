"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AppSettings, AttendanceRules } from "@/lib/hooks/useCompanySettings";
import Link from "next/link";
import { Toggle } from "@/components/dashboard/settings/Toggle";
import { KIOSK_ENABLED } from "@/lib/kiosk";

export function AppSettingsCard({
  appSettings,
  setAppSettings,
  attendanceRules,
  setAttendanceRules,
  isPro,
}: {
  appSettings: AppSettings;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  attendanceRules: AttendanceRules;
  setAttendanceRules: Dispatch<SetStateAction<AttendanceRules>>;
  isPro: boolean;
}) {
  // Task 5 v2 (3): two sections, Supervisor and Kiosk. Require admin PIN is
  // greyed out unless Create account is on; Kiosk is Pro (locked on Core).
  const kioskCreate = appSettings.kioskCreateAccount === true;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">
        Mobile App Settings
      </h2>
      <p className="mt-1 text-xs text-gray-600">
        Controls behavior in the mobile app.
      </p>
      <h3 className="mt-5 text-sm font-semibold text-gray-950">Supervisor</h3>
      <div className="mt-1 divide-y divide-gray-100">
        <div id="allow-supervisor-override">
          <Toggle
            label="Allow supervisor override"
            description="Supervisors can override normal clock-in rules on mobile."
            checked={appSettings.allowSupervisorOverride}
            onChange={(v) =>
              setAppSettings((prev) => ({ ...prev, allowSupervisorOverride: v }))
            }
          />
        </div>
        <div id="require-override-reason">
          <Toggle
            label="Require Reason for Supervisor Overrides"
            description="Require supervisors to provide a reason when overriding an employee's time action."
            checked={attendanceRules.requireOverrideReason}
            onChange={(v) =>
              setAttendanceRules((prev) => ({ ...prev, requireOverrideReason: v }))
            }
          />
        </div>
        <div id="allow-app-employee-create">
          <Toggle
            label="Allow creating employees from the app"
            description="Supervisors and admins can add a new employee from the mobile app, with a photo and PIN."
            checked={appSettings.allowAppEmployeeCreate}
            onChange={(v) =>
              setAppSettings((prev) => ({ ...prev, allowAppEmployeeCreate: v }))
            }
          />
        </div>
        <div id="allow-app-employee-update">
          <Toggle
            label="Allow updating employees from the app"
            description="Supervisors and admins can update an employee's name or photo from the mobile app."
            checked={appSettings.allowAppEmployeeUpdate}
            onChange={(v) =>
              setAppSettings((prev) => ({ ...prev, allowAppEmployeeUpdate: v }))
            }
          />
        </div>
        <div id="ask-job-site-each-time">
          <Toggle
            label="Ask for job site each time"
            description="At clock-in, pick the employee's assigned job site instead of using whatever site is selected on the device."
            checked={appSettings.askJobSiteEachTime}
            onChange={(v) =>
              setAppSettings((prev) => ({ ...prev, askJobSiteEachTime: v }))
            }
          />
        </div>
      </div>

      {KIOSK_ENABLED && (
        <>
          <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-gray-950">
            Kiosk
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Pro</span>
          </h3>
          {!isPro && (
            <p className="mt-1 text-xs text-gray-600">
              Kiosk is a Pro feature.{" "}
              <Link href="/dashboard/billing" className="font-medium text-accent hover:underline">Upgrade to Pro</Link>
            </p>
          )}
          <div className="mt-1 divide-y divide-gray-100">
            <div id="kiosk-create-account">
              <Toggle
                label="Create account"
                description="Shows a Create account button on the kiosk Home screen: name, birthday and photo, then the new PIN."
                checked={kioskCreate}
                disabled={!isPro}
                onChange={(v) =>
                  setAppSettings((prev) => ({ ...prev, kioskCreateAccount: v, ...(v ? {} : { kioskRequireAdminPin: false }) }))
                }
              />
            </div>
            <div id="kiosk-require-admin-pin">
              <Toggle
                label="Require admin PIN"
                description="The kiosk asks for an admin's PIN (an admin with Settings or Full access) before the Create account screen opens."
                checked={kioskCreate && appSettings.kioskRequireAdminPin === true}
                disabled={!isPro || !kioskCreate}
                onChange={(v) => setAppSettings((prev) => ({ ...prev, kioskRequireAdminPin: v }))}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
