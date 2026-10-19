"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ExportSettings } from "@/lib/types";
import type { AutoClockOutSettings } from "@/lib/hooks/useCompanySettings";
import { Toggle } from "@/components/dashboard/settings/Toggle";

export function AutomationsCard({
  exportSettings,
  setExportSettings,
  autoClockOut,
  setAutoClockOut,
}: {
  exportSettings: ExportSettings;
  setExportSettings: Dispatch<SetStateAction<ExportSettings>>;
  autoClockOut: AutoClockOutSettings;
  setAutoClockOut: Dispatch<SetStateAction<AutoClockOutSettings>>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">Automations</h2>
      <p className="mt-1 text-xs text-gray-600">
        Rules that run automatically on your employees&apos; time.
      </p>

      <div id="automatic-break-minutes" className="mt-5">
        <label
          htmlFor="automaticBreakMinutes"
          className="mb-2 block text-sm font-medium text-gray-950"
        >
          Automatic Break (minutes)
        </label>
        <input
          id="automaticBreakMinutes"
          type="number"
          min="0"
          max="120"
          step="1"
          value={exportSettings.automaticBreakMinutes}
          onChange={(e) =>
            setExportSettings((prev) => ({
              ...prev,
              automaticBreakMinutes: e.target.value
                ? Math.min(120, Math.max(0, Math.round(Number(e.target.value))))
                : 0,
            }))
          }
          className="w-32 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <p className="mt-2 text-xs text-gray-600">
          Deducted per shift, in addition to any real tracked break. 0 = off.
          For companies that don&apos;t track breaks but still want one
          deducted from payroll.
        </p>
      </div>

      <div id="minimum-shift-hours" className="mt-5">
        <label
          htmlFor="minimumShiftHours"
          className="mb-2 block text-sm font-medium text-gray-950"
        >
          Minimum Shift Length (hours)
        </label>
        <input
          id="minimumShiftHours"
          type="number"
          min="0"
          step="0.25"
          value={exportSettings.minimumShiftHours}
          onChange={(e) =>
            setExportSettings((prev) => ({
              ...prev,
              minimumShiftHours: e.target.value ? Math.max(0, Number(e.target.value)) : 0,
            }))
          }
          className="w-32 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <p className="mt-2 text-xs text-gray-600">
          The Automatic Break above only applies to shifts at least this long.
          Shorter shifts are unaffected.
        </p>
      </div>

      <div id="auto-clock-out" className="mt-5 border-t border-gray-100 pt-5">
        <Toggle
          label="Auto clock-out"
          description="Automatically clocks an employee out once they've worked this many hours in a shift. Breaks are not counted. Admins get an alert so they can review and correct the time."
          checked={autoClockOut.enabled}
          onChange={(v) => setAutoClockOut((prev) => ({ ...prev, enabled: v }))}
        />
        {autoClockOut.enabled && (
          <div className="mt-3">
            <label
              htmlFor="autoClockOutCap"
              className="mb-2 block text-sm font-medium text-gray-950"
            >
              Clock out after (worked hours)
            </label>
            <input
              id="autoClockOutCap"
              type="number"
              min="1"
              max="24"
              step="0.5"
              value={autoClockOut.maxWorkedHours}
              onChange={(e) =>
                setAutoClockOut((prev) => ({
                  ...prev,
                  maxWorkedHours: e.target.value
                    ? Math.min(24, Math.max(1, Number(e.target.value)))
                    : 1,
                }))
              }
              className="w-32 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
        )}
      </div>
    </div>
  );
}
