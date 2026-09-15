"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Alerts } from "@/lib/hooks/useCompanySettings";
import { Toggle } from "@/components/dashboard/settings/Toggle";
import { ThresholdField } from "@/components/dashboard/settings/ThresholdField";

export function AlertsCard({
  alerts,
  setAlerts,
  otThreshold,
  setOtThreshold,
}: {
  alerts: Alerts;
  setAlerts: Dispatch<SetStateAction<Alerts>>;
  otThreshold: string;
  setOtThreshold: (value: string) => void;
}) {
  return (
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

        <div className="py-1">
          <Toggle
            label="Max break time warning"
            checked={alerts.maxBreakWarning}
            onChange={(v) => setAlerts((prev) => ({ ...prev, maxBreakWarning: v }))}
          />
          <ThresholdField
            label="Warning after:"
            suffix="minutes"
            value={alerts.maxBreakMinutes}
            onChange={(v) => setAlerts((prev) => ({ ...prev, maxBreakMinutes: v }))}
          />
        </div>
      </div>
    </div>
  );
}
