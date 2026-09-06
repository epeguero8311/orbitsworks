"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { useSites } from "@/lib/hooks/useSites";
import { useSubcontractors } from "@/lib/hooks/useSubcontractors";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import type { ManualTimestampParams } from "@/lib/hooks/useTimesheetApprovals";

type Props = {
  defaultDate: string;
  minDate: string;
  onClose: () => void;
  onSubmit: (params: ManualTimestampParams) => Promise<void>;
};

function addMinutesToTime(hhmm: string, minutesToAdd: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutesToAdd;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const newH = Math.floor(wrapped / 60);
  const newM = wrapped % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

export default function AddTimestampModal({ defaultDate, minDate, onClose, onSubmit }: Props) {
  const { employees } = useEmployees();
  const { sites } = useSites();
  const { subcontractors } = useSubcontractors();
  const { settings } = useCompanySettings();

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);

  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const employeeInputRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState(defaultDate);
  const [clockInTime, setClockInTime] = useState("");
  const [clockOutTime, setClockOutTime] = useState("");
  const [includeBreak, setIncludeBreak] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState("");
  const [siteId, setSiteId] = useState("");
  const [companyOverride, setCompanyOverride] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return activeEmployees;
    return activeEmployees.filter((e) => e.name.toLowerCase().includes(q));
  }, [activeEmployees, employeeQuery]);

  function pickEmployee(id: string, name: string) {
    setEmployeeId(id);
    setEmployeeQuery(name);
    setShowEmployeeList(false);
  }

  async function handleSubmit() {
    if (!employeeId || !clockInTime || !clockOutTime || !reason.trim()) {
      setErrorMsg("Employee, clock in, clock out, and a reason are required.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const minutes = includeBreak ? parseInt(breakMinutes, 10) || 0 : 0;
      let breakStartTime: string | null = null;
      let breakEndTime: string | null = null;
      if (minutes > 0) {
        breakStartTime = clockInTime;
        breakEndTime = addMinutesToTime(clockInTime, minutes);
      }
      const params: ManualTimestampParams = {
        employeeId,
        date,
        clockInTime,
        clockOutTime,
        breakStartTime,
        breakEndTime,
        siteId: siteId || null,
        reason: reason.trim(),
      };
      if (companyOverride === "__main__") {
        params.subcontractorId = null;
      } else if (companyOverride) {
        params.subcontractorId = companyOverride;
      }
      await onSubmit(params);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add timestamp.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-base font-semibold text-gray-950">Add Missing Timestamp</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="relative">
            <label className="block text-xs font-medium text-gray-600">Employee</label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                ref={employeeInputRef}
                type="text"
                value={employeeQuery}
                onChange={(e) => {
                  setEmployeeQuery(e.target.value);
                  setEmployeeId(null);
                  setShowEmployeeList(true);
                }}
                onFocus={() => setShowEmployeeList(true)}
                placeholder="Search employees..."
                className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-2 text-sm"
              />
            </div>
            {showEmployeeList && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {filteredEmployees.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-gray-600">No employees match.</p>
                ) : (
                  filteredEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => pickEmployee(emp.id, emp.name)}
                      className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-950 hover:bg-gray-50"
                    >
                      {emp.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">Date</label>
            <input
              type="date"
              value={date}
              min={minDate}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600">Clock in</label>
              <input
                type="time"
                value={clockInTime}
                onChange={(e) => setClockInTime(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Clock out</label>
              <input
                type="time"
                value={clockOutTime}
                onChange={(e) => setClockOutTime(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            <input
              type="checkbox"
              checked={includeBreak}
              onChange={(e) => setIncludeBreak(e.target.checked)}
            />
            Include a break (optional)
          </label>

          {includeBreak && (
            <div>
              <label className="block text-xs font-medium text-gray-600">Break (minutes)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
                placeholder="e.g. 30"
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Job site (optional)
            </label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            >
              <option value="">Not specified</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {subcontractors.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Company (optional)
              </label>
              <select
                value={companyOverride}
                onChange={(e) => setCompanyOverride(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
              >
                <option value="">Use employee&apos;s current company</option>
                <option value="__main__">{settings?.name || "Main company"}</option>
                {subcontractors
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Kiosk was unavailable"
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            />
          </div>

          {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add Timestamp"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}