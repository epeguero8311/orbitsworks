"use client";

import { ClockEvent } from "@/lib/types";

// "Adjust time" link + inline form (step 1 of the correction; step 2 is
// CorrectionConfirm). Pulled out of EventSide (same markup) so Timesheet
// Approvals > Session review can put it under clock in/out and each break.
export type AdjustTimeProps = {
  adjustingId: string | null;
  onStartAdjust: (event: ClockEvent) => void;
  onCancelAdjust: () => void;
  onSubmitAdjust: (event: ClockEvent) => void;
  newTimeValue: string;
  onNewTimeChange: (v: string) => void;
  reasonValue: string;
  onReasonChange: (v: string) => void;
  submitting: boolean;
  errorMsg: string | null;
};

export function AdjustTimeControl({
  event,
  linkText = "Adjust time",
  adjustingId,
  onStartAdjust,
  onCancelAdjust,
  onSubmitAdjust,
  newTimeValue,
  onNewTimeChange,
  reasonValue,
  onReasonChange,
  submitting,
  errorMsg,
}: AdjustTimeProps & { event: ClockEvent; linkText?: string }) {
  const isAdjustingThis = adjustingId === event.id;
  return (
    <div className="mt-3">
      {isAdjustingThis ? (
        <div className="space-y-2 rounded-md border border-gray-200 p-3">
          <label className="block text-xs font-medium text-gray-600">
            Corrected time
          </label>
          <input
            type="datetime-local"
            value={newTimeValue}
            onChange={(e) => onNewTimeChange(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
          />
          <label className="block text-xs font-medium text-gray-600">
            Reason (optional)
          </label>
          <input
            type="text"
            value={reasonValue}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="e.g. Forgot to clock out"
            maxLength={500}
            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
          />
          {errorMsg && (
            <p className="text-xs text-red-600">{errorMsg}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting || !newTimeValue}
              onClick={() => onSubmitAdjust(event)}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save correction"}
            </button>
            <button
              type="button"
              onClick={onCancelAdjust}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onStartAdjust(event)}
          className="text-xs font-medium text-accent hover:underline"
        >
          {linkText}
        </button>
      )}
    </div>
  );
}
