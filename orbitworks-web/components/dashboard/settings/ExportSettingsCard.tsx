"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ExportSettings, RoundingIncrement } from "@/lib/types";
import type { OvertimeFields, OvertimeWeekday } from "@/lib/hooks/useCompanySettings";
import { Toggle } from "@/components/dashboard/settings/Toggle";
import { ThresholdField } from "@/components/dashboard/settings/ThresholdField";

const ROUNDING_OPTIONS: { value: RoundingIncrement; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 5, label: "5 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
];

const WEEKDAY_OPTIONS: { value: OvertimeWeekday; label: string }[] = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

// Overtime (Task 1): Overtime + Overtime Pay sections. The weekly
// threshold and multiplier inputs moved here from Alerts > Overtime
// warning (same top-level fields, no migration). Every field stays visible
// even with Overtime off, because Weekly overtime after also sets when the
// Overtime warning fires.
export function ExportSettingsCard({
  exportSettings,
  setExportSettings,
  otThreshold,
  setOtThreshold,
  otMultiplier,
  setOtMultiplier,
  overtime,
  setOvertime,
}: {
  exportSettings: ExportSettings;
  setExportSettings: Dispatch<SetStateAction<ExportSettings>>;
  otThreshold: string;
  setOtThreshold: (value: string) => void;
  otMultiplier: string;
  setOtMultiplier: (value: string) => void;
  overtime: OvertimeFields;
  setOvertime: Dispatch<SetStateAction<OvertimeFields>>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-950">Overtime</h2>
        <div className="mt-2 divide-y divide-gray-100">
          <div id="overtime-enabled" className="py-1">
            <Toggle
              label="Overtime"
              description="Adds overtime hours and overtime pay to exports. Off: exports work exactly like today."
              checked={overtime.overtimeEnabled}
              onChange={(v) => setOvertime((prev) => ({ ...prev, overtimeEnabled: v }))}
            />
          </div>

          <div id="weekly-overtime-after" className="pt-3.5">
            <ThresholdField
              label="Weekly overtime after:"
              suffix="hrs"
              value={otThreshold ? parseFloat(otThreshold) : 40}
              onChange={(v) => setOtThreshold(String(v))}
            />
            <p className="-mt-2 pb-3.5 text-xs text-gray-600">
              Also sets when the Overtime warning fires (Alerts), even with Overtime off.
            </p>
          </div>

          <div id="daily-overtime-after" className="pt-3.5">
            <ThresholdField
              label="Daily overtime after:"
              suffix="hrs (0 = off)"
              value={overtime.dailyOvertimeThreshold}
              onChange={(v) => setOvertime((prev) => ({ ...prev, dailyOvertimeThreshold: v }))}
            />
          </div>

          <div id="overtime-week-start" className="flex items-center gap-2 py-3.5">
            <label htmlFor="overtimeWeekStartsOn" className="text-xs text-gray-600">
              Week starts on:
            </label>
            <select
              id="overtimeWeekStartsOn"
              value={overtime.overtimeWeekStartsOn}
              onChange={(e) =>
                setOvertime((prev) => ({
                  ...prev,
                  overtimeWeekStartsOn: Number(e.target.value) as OvertimeWeekday,
                }))
              }
              className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {WEEKDAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-950">Overtime Pay</h2>
        <div id="overtime-multiplier" className="mt-4 flex items-center gap-2">
          <label htmlFor="overtimeMultiplier" className="text-xs text-gray-600">
            Multiplier:
          </label>
          <input
            id="overtimeMultiplier"
            type="number"
            min="1"
            step="0.1"
            value={otMultiplier}
            onChange={(e) => setOtMultiplier(e.target.value)}
            className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-950 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <span className="text-xs text-gray-600">x job rate, unless the job has its own Overtime rate</span>
        </div>
        <p className="mt-3 text-xs text-gray-600">
          Note: paying OT at the job&apos;s rate requires the worker&apos;s agreement beforehand.
        </p>
      </div>

    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-950">Rounding</h2>
      <p className="mt-1 text-xs text-gray-600">
        Rounding for payroll hours. Always rounds up.
      </p>

      <div id="round-daily-minutes" className="mt-5">
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

      <div id="round-total-minutes" className="mt-5">
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

      <div id="round-overtime-minutes" className="mt-5">
        <label
          htmlFor="overtimeRoundMinutes"
          className="mb-2 block text-sm font-medium text-gray-950"
        >
          Round overtime hours
        </label>
        <select
          id="overtimeRoundMinutes"
          value={overtime.overtimeRoundMinutes}
          onChange={(e) =>
            setOvertime((prev) => ({
              ...prev,
              overtimeRoundMinutes: Number(e.target.value) as RoundingIncrement,
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
          Each day&apos;s overtime is rounded up. The period total is the sum of the days.
        </p>
      </div>
    </div>
    </div>
  );
}
