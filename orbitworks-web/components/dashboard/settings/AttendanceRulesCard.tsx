"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AttendanceRules } from "@/lib/hooks/useCompanySettings";
import { Toggle } from "@/components/dashboard/settings/Toggle";

export function AttendanceRulesCard({
  attendanceRules,
  setAttendanceRules,
}: {
  attendanceRules: AttendanceRules;
  setAttendanceRules: Dispatch<SetStateAction<AttendanceRules>>;
}) {
  return (
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
  );
}
