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
    </div>
  );
}
