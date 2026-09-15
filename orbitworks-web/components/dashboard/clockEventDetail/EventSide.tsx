"use client";

import { ClockEvent } from "@/lib/types";
import {
  effectiveDate,
  locationDisplay,
  sourceLabel,
} from "@/lib/clockEventDetailUtils";

export function EventSide({
  label,
  event,
  isAdmin,
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
  showHistoryId,
  onToggleHistory,
}: {
  label: string;
  event: ClockEvent | null;
  isAdmin: boolean;
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
  showHistoryId: string | null;
  onToggleHistory: (id: string | null) => void;
}) {
  if (!event) {
    return (
      <div className="flex-1 rounded-lg border border-dashed border-gray-200 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
          {label}
        </p>
        <p className="mt-3 text-sm text-gray-600">
          No matching event found for this day.
        </p>
      </div>
    );
  }

  const badge = sourceLabel(event.source);
  const loc = locationDisplay(event.location);
  const isAdjusted = !!event.adjustedTimestamp;
  const hasHistory = !!event.adjustmentHistory && event.adjustmentHistory.length > 0;
  const displayDate = effectiveDate(event);
  const isAdjustingThis = adjustingId === event.id;
  const isShowingHistory = showHistoryId === event.id;

  return (
    <div className="flex-1 rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
          {label}
        </p>
        {(isAdjusted || hasHistory) && (
          <button
            type="button"
            onClick={() => onToggleHistory(isShowingHistory ? null : event.id)}
            className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Adjusted
          </button>
        )}
      </div>

      <div className="mt-3 aspect-square w-full overflow-hidden rounded-md bg-gray-100">
        {event.photoUrl ? (
          <img
            src={event.photoUrl}
            alt={`${label} proof photo`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-600">
            No photo recorded
          </div>
        )}
      </div>

      <p className="mt-3 font-mono text-sm text-gray-950">
        {displayDate ? displayDate.toLocaleString() : "-"}
      </p>

      <span
        className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
      >
        {badge.text}
      </span>

      <p className="mt-2 text-xs text-gray-600">
        {loc.mapUrl ? (
          <button
            type="button"
            onClick={() => window.open(loc.mapUrl as string, "_blank")}
            className="text-accent hover:underline"
          >
            {loc.text}
          </button>
        ) : (
          loc.text
        )}
      </p>

      {event.note && (
        <p className="mt-2 text-xs text-gray-600">Note: {event.note}</p>
      )}

      {isShowingHistory && hasHistory && (
        <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-950">Adjustment history</p>
          {event.adjustmentHistory!
            .slice()
            .reverse()
            .map((adj, i) => (
              <div key={i} className="text-xs text-gray-600">
                {adj.fieldChanged === "employeeId" ? (
                  <p>
                    Reassigned from {String(adj.previousValue)} to{" "}
                    {String(adj.newValue)}
                  </p>
                ) : (
                  <p>
                    {(adj.previousValue as ClockEvent["timestamp"])!
                      .toDate()
                      .toLocaleString()}{" "}
                    to{" "}
                    {(adj.newValue as ClockEvent["timestamp"])!
                      .toDate()
                      .toLocaleString()}
                  </p>
                )}
                <p className="text-gray-500">
                  by {adj.changedByName} on{" "}
                  {adj.changedAt.toDate().toLocaleString()}
                  {adj.reason ? ` - ${adj.reason}` : ""}
                </p>
              </div>
            ))}
        </div>
      )}

      {isAdmin && (
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
              Adjust time
            </button>
          )}
        </div>
      )}
    </div>
  );
}
