"use client";

import { useClockEventDetail } from "@/lib/hooks/useClockEventDetail";
import { EmployeeReassignDropdown } from "@/components/dashboard/clockEventDetail/EmployeeReassignDropdown";
import { EventSide } from "@/components/dashboard/clockEventDetail/EventSide";
import { ClockEvent } from "@/lib/types";

type Props = {
  event: ClockEvent;
  allEvents: ClockEvent[];
  onClose: () => void;
};

export default function ClockEventDetailModal({
  event,
  allEvents,
  onClose,
}: Props) {
  const d = useClockEventDetail({ event, allEvents });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-950">
                {d.liveEvent.employeeName}
              </h2>
              {d.isAdmin && (
                <EmployeeReassignDropdown
                  currentEmployeeId={d.liveEvent.employeeId}
                  employees={d.activeEmployees}
                  onPick={d.handlePickReassign}
                />
              )}
            </div>
            <p className="mt-0.5 text-sm text-gray-600">
              {d.dayLabel} - {d.liveEvent.siteName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        {d.pendingNewEmployeeId && (
          <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-medium text-gray-950">
              Change this clock event from{" "}
              <span className="font-semibold">{d.liveEvent.employeeName}</span>{" "}
              to <span className="font-semibold">{d.pendingEmployeeName}</span>?
            </p>
            <p className="mt-1 text-xs text-gray-600">
              The timestamp stays the same - it will just belong to the new
              employee instead.
            </p>
            {d.reassignError && (
              <p className="mt-2 text-xs text-red-600">{d.reassignError}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={d.reassignSubmitting}
                onClick={d.handleConfirmReassign}
                className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {d.reassignSubmitting ? "Changing..." : "Change"}
              </button>
              <button
                type="button"
                onClick={d.handleCancelReassign}
                className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <EventSide
            label="Clock in"
            event={d.clockInEvent}
            isAdmin={d.isAdmin}
            adjustingId={d.adjustingId}
            onStartAdjust={d.handleStartAdjust}
            onCancelAdjust={d.handleCancelAdjust}
            onSubmitAdjust={d.handleSubmitAdjust}
            newTimeValue={d.newTimeValue}
            onNewTimeChange={d.setNewTimeValue}
            reasonValue={d.reasonValue}
            onReasonChange={d.setReasonValue}
            submitting={d.submitting}
            errorMsg={d.errorMsg}
            showHistoryId={d.showHistoryId}
            onToggleHistory={d.setShowHistoryId}
          />
          <EventSide
            label="Clock out"
            event={d.clockOutEvent}
            isAdmin={d.isAdmin}
            adjustingId={d.adjustingId}
            onStartAdjust={d.handleStartAdjust}
            onCancelAdjust={d.handleCancelAdjust}
            onSubmitAdjust={d.handleSubmitAdjust}
            newTimeValue={d.newTimeValue}
            onNewTimeChange={d.setNewTimeValue}
            reasonValue={d.reasonValue}
            onReasonChange={d.setReasonValue}
            submitting={d.submitting}
            errorMsg={d.errorMsg}
            showHistoryId={d.showHistoryId}
            onToggleHistory={d.setShowHistoryId}
          />
        </div>
      </div>
    </div>
  );
}
