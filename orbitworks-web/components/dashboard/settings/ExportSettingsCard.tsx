"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ExportSettings, RoundingIncrement } from "@/lib/types";

const ROUNDING_OPTIONS: { value: RoundingIncrement; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 5, label: "5 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
];

export function ExportSettingsCard({
  exportSettings,
  setExportSettings,
}: {
  exportSettings: ExportSettings;
  setExportSettings: Dispatch<SetStateAction<ExportSettings>>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">Export Settings</h2>
      <p className="mt-1 text-xs text-gray-600">
        Rounding for payroll hours. Always rounds up.
      </p>

      <div className="mt-5">
        <label
          htmlFor="roundDailyMinutes"
          className="mb-2 block text-sm font-medium text-gray-950"
        >
          Round daily worked hours
        </label>
        <select
          id="roundDailyMinutes"
          value={exportSettings.roundDailyMinutes}
          onChange={(e) =>
            setExportSettings((prev) => ({
              ...prev,
              roundDailyMinutes: Number(e.target.value) as RoundingIncrement,
            }))
          }
          className="w-40 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          {ROUNDING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-600">
          Each day&apos;s worked hours are rounded up. Shown in the Daily Breakdown.
        </p>
      </div>

      <div className="mt-5">
        <label
          htmlFor="roundTotalMinutes"
          className="mb-2 block text-sm font-medium text-gray-950"
        >
          Round total worked hours
        </label>
        <select
          id="roundTotalMinutes"
          value={exportSettings.roundTotalMinutes}
          onChange={(e) =>
            setExportSettings((prev) => ({
              ...prev,
              roundTotalMinutes: Number(e.target.value) as RoundingIncrement,
            }))
          }
          className="w-40 rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          {ROUNDING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-600">
          The final payroll total is rounded up. Shown in the summary at the top.
        </p>
      </div>

      <div className="mt-5">
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

      <div className="mt-5">
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
    </div>
  );
}
