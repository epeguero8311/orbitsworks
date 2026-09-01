"use client";

import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { ChevronDown, Pencil, Check } from "lucide-react";
import { functions } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useEmployees } from "@/lib/hooks/useEmployees";
import { ClockEvent, ClockEventAdjustment } from "@/lib/types";

type Props = {
  event: ClockEvent;
  allEvents: ClockEvent[];
  onClose: () => void;
};

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function effectiveDate(event: ClockEvent): Date | null {
  const ts = event.adjustedTimestamp ?? event.timestamp;
  return ts ? ts.toDate() : null;
}

function findPairedEvent(
  event: ClockEvent,
  allEvents: ClockEvent[]
): ClockEvent | null {
  const clickedDate = effectiveDate(event);
  if (!clickedDate) return null;
  const wantType = event.type === "in" ? "out" : "in";

  const candidates = allEvents.filter((e) => {
    const d = effectiveDate(e);
    return (
      e.id !== event.id &&
      e.employeeId === event.employeeId &&
      e.type === wantType &&
      d &&
      isSameCalendarDay(d, clickedDate)
    );
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const dA = effectiveDate(a)!.getTime();
    const dB = effectiveDate(b)!.getTime();
    return Math.abs(dA - clickedDate.getTime()) - Math.abs(dB - clickedDate.getTime());
  });

  return candidates[0];
}

function sourceLabel(source: ClockEvent["source"]) {
  switch (source) {
    case "faceMatch":
      return { text: "Face match", className: "bg-green-50 text-green-700" };
    case "pin":
      return { text: "PIN", className: "bg-purple-50 text-purple-700" };
    case "supervisorOverride":
      return {
        text: "Supervisor override",
        className: "bg-amber-50 text-amber-700",
      };
    case "adminManual":
      return { text: "Admin manual", className: "bg-blue-50 text-blue-700" };
    default:
      return { text: "Unknown", className: "bg-gray-50 text-gray-600" };
  }
}

function locationDisplay(location: ClockEvent["location"]) {
  if (!location) {
    return { text: "No location recorded", mapUrl: null as string | null };
  }
  if (typeof location === "string") {
    return { text: location, mapUrl: null as string | null };
  }
  const text = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
  const mapUrl = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  return { text, mapUrl };
}

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function EmployeeReassignDropdown({
  currentEmployeeId,
  employees,
  onPick,
}: {
  currentEmployeeId: string;
  employees: { id: string; name: string }[];
  onPick: (employeeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-accent hover:border-accent hover:bg-blue-50"
      >
        <Pencil className="h-3 w-3" />
        Change
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {employees.map((emp) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(emp.id);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-950 hover:bg-gray-50"
            >
              {emp.name}
              {emp.id === currentEmployeeId && (
                <Check className="h-3.5 w-3.5 text-accent" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EventSide({
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

export default function ClockEventDetailModal({
  event,
  allEvents,
  onClose,
}: Props) {
  const { userData } = useAuth();
  const isAdmin = userData?.role === "admin";
  const { employees } = useEmployees();

  const liveEvent = allEvents.find((e) => e.id === event.id) ?? event;

  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [newTimeValue, setNewTimeValue] = useState("");
  const [reasonValue, setReasonValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHistoryId, setShowHistoryId] = useState<string | null>(null);

  const [pendingNewEmployeeId, setPendingNewEmployeeId] = useState<string | null>(null);
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const pair = findPairedEvent(liveEvent, allEvents);
  const clockInEvent = liveEvent.type === "in" ? liveEvent : pair;
  const clockOutEvent = liveEvent.type === "out" ? liveEvent : pair;

  const dayDate = effectiveDate(liveEvent);
  const dayLabel = dayDate
    ? dayDate.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown date";

  const activeEmployees = employees.filter((e) => e.active);
  const pendingEmployeeName = pendingNewEmployeeId
    ? activeEmployees.find((e) => e.id === pendingNewEmployeeId)?.name ??
      "Unknown"
    : null;

  function handleStartAdjust(target: ClockEvent) {
    const d = effectiveDate(target);
    setNewTimeValue(d ? toDatetimeLocalValue(d) : "");
    setReasonValue("");
    setErrorMsg(null);
    setAdjustingId(target.id);
  }

  function handleCancelAdjust() {
    setAdjustingId(null);
    setNewTimeValue("");
    setReasonValue("");
    setErrorMsg(null);
  }

  async function handleSubmitAdjust(target: ClockEvent) {
    if (!newTimeValue) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const newTimestampMs = new Date(newTimeValue).getTime();
      if (!Number.isFinite(newTimestampMs)) {
        throw new Error("Invalid date/time.");
      }
      const correctClockEventFn = httpsCallable(functions, "correctClockEvent");
      await correctClockEventFn({
        eventId: target.id,
        newTimestamp: newTimestampMs,
        ...(reasonValue.trim() ? { reason: reasonValue.trim() } : {}),
      });
      setAdjustingId(null);
      setNewTimeValue("");
      setReasonValue("");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to save correction."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handlePickReassign(newEmployeeId: string) {
    if (!newEmployeeId || newEmployeeId === liveEvent.employeeId) return;
    setPendingNewEmployeeId(newEmployeeId);
    setReassignError(null);
  }

  function handleCancelReassign() {
    setPendingNewEmployeeId(null);
    setReassignError(null);
  }

  async function handleConfirmReassign() {
    if (!pendingNewEmployeeId) return;
    setReassignSubmitting(true);
    setReassignError(null);
    try {
      const reassignClockEventFn = httpsCallable(functions, "reassignClockEvent");
      await reassignClockEventFn({
        eventId: liveEvent.id,
        newEmployeeId: pendingNewEmployeeId,
      });
      setPendingNewEmployeeId(null);
    } catch (err) {
      setReassignError(
        err instanceof Error ? err.message : "Failed to reassign this event."
      );
    } finally {
      setReassignSubmitting(false);
    }
  }

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
                {liveEvent.employeeName}
              </h2>
              {isAdmin && (
                <EmployeeReassignDropdown
                  currentEmployeeId={liveEvent.employeeId}
                  employees={activeEmployees}
                  onPick={handlePickReassign}
                />
              )}
            </div>
            <p className="mt-0.5 text-sm text-gray-600">
              {dayLabel} - {liveEvent.siteName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        {pendingNewEmployeeId && (
          <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-medium text-gray-950">
              Change this clock event from{" "}
              <span className="font-semibold">{liveEvent.employeeName}</span>{" "}
              to <span className="font-semibold">{pendingEmployeeName}</span>?
            </p>
            <p className="mt-1 text-xs text-gray-600">
              The timestamp stays the same - it will just belong to the new
              employee instead.
            </p>
            {reassignError && (
              <p className="mt-2 text-xs text-red-600">{reassignError}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={reassignSubmitting}
                onClick={handleConfirmReassign}
                className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reassignSubmitting ? "Changing..." : "Change"}
              </button>
              <button
                type="button"
                onClick={handleCancelReassign}
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
            event={clockInEvent}
            isAdmin={isAdmin}
            adjustingId={adjustingId}
            onStartAdjust={handleStartAdjust}
            onCancelAdjust={handleCancelAdjust}
            onSubmitAdjust={handleSubmitAdjust}
            newTimeValue={newTimeValue}
            onNewTimeChange={setNewTimeValue}
            reasonValue={reasonValue}
            onReasonChange={setReasonValue}
            submitting={submitting}
            errorMsg={errorMsg}
            showHistoryId={showHistoryId}
            onToggleHistory={setShowHistoryId}
          />
          <EventSide
            label="Clock out"
            event={clockOutEvent}
            isAdmin={isAdmin}
            adjustingId={adjustingId}
            onStartAdjust={handleStartAdjust}
            onCancelAdjust={handleCancelAdjust}
            onSubmitAdjust={handleSubmitAdjust}
            newTimeValue={newTimeValue}
            onNewTimeChange={setNewTimeValue}
            reasonValue={reasonValue}
            onReasonChange={setReasonValue}
            submitting={submitting}
            errorMsg={errorMsg}
            showHistoryId={showHistoryId}
            onToggleHistory={setShowHistoryId}
          />
        </div>
      </div>
    </div>
  );
}