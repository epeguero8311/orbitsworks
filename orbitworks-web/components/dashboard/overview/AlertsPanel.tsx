"use client";

import { useState } from "react";
import Link from "next/link";
import { useAlertActions } from "@/lib/hooks/useAlertActions";
import { useServerAlerts } from "@/lib/hooks/useServerAlerts";
import { useEmployeeUpdates } from "@/lib/hooks/useEmployeeUpdates";
import type { ClockEvent } from "@/lib/types";
import { ClockPhoto } from "@/components/time/ClockPhoto";
import { ReferencePhoto } from "@/components/time/ReferencePhoto";
import { faceResultText } from "@/lib/clockPhoto";
import { alertsCapNote } from "@/lib/alertsWindow";
import { CollapseButton } from "@/components/dashboard/CollapseButton";
import { reviewCorrection, clockEventTypeLabel, type CorrectionNeighbours } from "@/lib/clockCorrection";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import {
  ALERT_SEVERITY,
  AlertItem,
  AlertSeverity,
  alertTitle,
  effectiveDate,
  toDatetimeLocalValue,
} from "@/lib/dashboardOverviewUtils";
import { toastIfPermissionDenied } from "@/lib/permissionErrors";

const SEVERITY_DOT_CLASSES: Record<AlertSeverity, string> = {
  urgent: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export default function AlertsPanel({
  loading,
  currentlyActive,
  recentEvents,
}: {
  loading: boolean;
  currentlyActive: ClockEvent[];
  // clockedInOutsideGeofence/siteMismatch are both about a specific past
  // clock-in moment, not current status - this is what lets their event
  // be resolved precisely by eventId below, instead of just whichever
  // event currentlyActive happens to have for that employee right now.
  recentEvents: ClockEvent[];
}) {
  const { alerts: serverAlerts, loading: alertsLoading } = useServerAlerts();
  const { employeeUpdates } = useEmployeeUpdates();
  const {
    resolvedKeys,
    ignoreAlert,
    ignoreAll,
    confirmFaceMatchFromAlert,
    clockOutFromAlert,
    endBreakFromAlert,
    submitEditTimeFromAlert,
    editClockInTimeFromAlert,
  } = useAlertActions();
  const adminAccess = useAdminAccess();

  const [editingAlertKey, setEditingAlertKey] = useState<string | null>(null);
  const [editTimeValue, setEditTimeValue] = useState("");
  // Moving a clock-in (correctClockEvent) waits for a Confirm, same as the
  // event detail window's "Adjust time". Holds what the confirm shows.
  const [pendingClockInEdit, setPendingClockInEdit] = useState<
    { alertKey: string; oldMs: number; newMs: number; neighbours: CorrectionNeighbours } | null
  >(null);
  const [alertActionSubmitting, setAlertActionSubmitting] = useState<string | null>(null);
  const [alertActionError, setAlertActionError] = useState<string | null>(null);
  const [ignoringAll, setIgnoringAll] = useState(false);
  // Phase 10 (W2): open on every visit.
  const [open, setOpen] = useState(true);

  // currentlyActive already carries each employee's latest event (whether
  // that's an "in" or a still-open "breakStart") - see useDashboardStatus's
  // derivation - so a single map covers both the maxHours/missedClockOut
  // and breakTooLong action buttons below.
  const eventByEmployee = new Map<string, ClockEvent>();
  currentlyActive.forEach((e) => eventByEmployee.set(e.employeeId, e));

  // clockedInOutsideGeofence/siteMismatch are both about a specific past
  // clock-in, not an employee's current session - eventByEmployee would
  // attach the wrong event (or none) once that employee has since
  // clocked out or started a new session elsewhere, so these two resolve
  // their event by the eventId the server alert carries instead, falling
  // back to eventByEmployee only if that event has aged out of
  // recentEvents.
  const eventById = new Map<string, ClockEvent>();
  recentEvents.forEach((e) => eventById.set(e.id, e));

  // faceMismatch/faceNoFace join these for the same reason - both are
  // about a specific past clock-in, not current status. faceBadReference
  // is never event-scoped at all (no clock event caused it), so it's
  // deliberately left out - eventByEmployee would attach a wrong/stale
  // event to it otherwise.
  const EVENT_SCOPED_ALERT_TYPES = new Set([
    "clockedInOutsideGeofence",
    "siteMismatch",
    "faceMismatch",
    "faceNoFace",
    // Phase 8: eventId is the shift's clock-in.
    "leftJobSite",
  ]);

  // Update Employee (mobile) - every employeeUpdated alert has exactly one
  // specific update it's about (no "current status" ambiguity the way
  // clock-event-scoped alerts have), so this is a plain id->doc lookup.
  const employeeUpdateById = new Map(employeeUpdates.map((u) => [u.id, u]));

  const alertItems: AlertItem[] = serverAlerts.map((a) => ({
    ...a,
    event:
      EVENT_SCOPED_ALERT_TYPES.has(a.alertType) && a.eventId
        ? eventById.get(a.eventId) ?? eventByEmployee.get(a.employeeId)
        : eventByEmployee.get(a.employeeId),
    employeeUpdate: a.employeeUpdateId ? employeeUpdateById.get(a.employeeUpdateId) : undefined,
  }));
  const visibleAlertItems = alertItems.filter((a) => !resolvedKeys.has(a.key));
  const isLoading = loading || alertsLoading;

  // Task 4 (rule 4 / D18): every admin sees every alert, but the clock
  // actions need Approve hours and the shift's site (the server checks too).
  const shiftActionTypes = new Set(["breakTooLong", "maxHours", "missedClockOut", "clockedInOutsideGeofence", "faceMismatch", "faceNoFace"]);
  function actionBlocked(alert: AlertItem): string | null {
    if (!shiftActionTypes.has(alert.alertType)) return null;
    if (!adminAccess.can("approveHours")) return "You don't have the Approve hours permission";
    if (alert.event && !adminAccess.canSite(alert.event.siteId)) return "Not your site";
    return null;
  }

  async function handleIgnoreAll() {
    setIgnoringAll(true);
    setAlertActionError(null);
    try {
      // faceBadReference has no Ignore (individually or in bulk) - it
      // auto-resolves server-side, never via alertActions.
      await ignoreAll(visibleAlertItems.filter((a) => a.alertType !== "faceBadReference"));
    } catch (err) {
      console.error("Ignore all alerts error:", err);
      if (toastIfPermissionDenied(err, { action: "ignore alerts", permission: "approveHours" })) return;
      setAlertActionError("Couldn't ignore all alerts. Try again.");
    } finally {
      setIgnoringAll(false);
    }
  }

  async function handleIgnoreAlert(alert: AlertItem) {
    setAlertActionSubmitting(alert.key);
    setAlertActionError(null);
    try {
      await ignoreAlert(alert);
    } catch (err) {
      console.error("Ignore alert error:", err);
      if (toastIfPermissionDenied(err, { action: "ignore alerts", permission: "approveHours" })) return;
      setAlertActionError("Couldn't ignore this alert. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }

  async function handleClockOutFromAlert(alert: AlertItem) {
    setAlertActionSubmitting(alert.key);
    setAlertActionError(null);
    try {
      await clockOutFromAlert(alert);
    } catch (err) {
      console.error("Clock out from alert error:", err);
      if (toastIfPermissionDenied(err, { action: "clock employees out", permission: "approveHours" })) return;
      setAlertActionError("Couldn't clock out. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }

  async function handleConfirmFaceMatch(alert: AlertItem) {
    setAlertActionSubmitting(alert.key);
    setAlertActionError(null);
    try {
      await confirmFaceMatchFromAlert(alert);
    } catch (err) {
      console.error("Confirm face match error:", err);
      if (toastIfPermissionDenied(err, { action: "confirm face matches", permission: "approveHours" })) return;
      setAlertActionError("Couldn't confirm. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }

  async function handleEndBreakFromAlert(alert: AlertItem) {
    setAlertActionSubmitting(alert.key);
    setAlertActionError(null);
    try {
      await endBreakFromAlert(alert);
    } catch (err) {
      console.error("End break from alert error:", err);
      if (toastIfPermissionDenied(err, { action: "end breaks", permission: "approveHours" })) return;
      setAlertActionError("Couldn't end break. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }

  function handleStartEditTime(alert: AlertItem) {
    const base = alert.event ? effectiveDate(alert.event) ?? new Date() : new Date();
    setEditingAlertKey(alert.key);
    setEditTimeValue(toDatetimeLocalValue(base));
    setAlertActionError(null);
  }

  function handleCancelEditTime() {
    setPendingClockInEdit(null);
    setEditingAlertKey(null);
    setEditTimeValue("");
    setAlertActionError(null);
  }

  async function handleSubmitEditTime(alert: AlertItem) {
    if (!editTimeValue) return;
    setAlertActionSubmitting(alert.key);
    setAlertActionError(null);
    try {
      const chosenMs = new Date(editTimeValue).getTime();
      if (alert.alertType === "clockedInOutsideGeofence") {
        // Step 1: check and show the confirm. Step 2 (Confirm) saves.
        if (!pendingClockInEdit || pendingClockInEdit.alertKey !== alert.key || pendingClockInEdit.newMs !== chosenMs) {
          if (!alert.event) return;
          const review = reviewCorrection(alert.event, recentEvents, chosenMs);
          if (!review.ok) {
            setAlertActionError(review.error);
            return;
          }
          setPendingClockInEdit({ alertKey: alert.key, oldMs: review.oldMs, newMs: review.newMs, neighbours: review.neighbours });
          return;
        }
        setPendingClockInEdit(null);
        await editClockInTimeFromAlert(alert, chosenMs);
      } else {
        await submitEditTimeFromAlert(alert, chosenMs);
      }
      setEditingAlertKey(null);
      setEditTimeValue("");
    } catch (err) {
      console.error("Edit time from alert error:", err);
      if (toastIfPermissionDenied(err, { action: "edit time", permission: "approveHours" })) return;
      setAlertActionError(
        err instanceof Error ? err.message : "Couldn't save this time."
      );
    } finally {
      setAlertActionSubmitting(null);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <h2>
          <CollapseButton title="Alerts" open={open} onToggle={() => setOpen((o) => !o)} count={isLoading ? undefined : visibleAlertItems.length} />
        </h2>
        {open && visibleAlertItems.length > 0 && (
          <button
            type="button"
            disabled={ignoringAll}
            onClick={handleIgnoreAll}
            className="text-sm font-medium text-[#3b6fe0] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ignoringAll ? "Ignoring..." : "Ignore all"}
          </button>
        )}
      </div>
      {open && (
      <>
      <p className="mt-1 text-sm text-gray-600">
        Driven by your alert settings - turn these on or off in Settings.
      </p>
      {alertActionError && (
        <p className="mt-3 text-xs text-red-600">{alertActionError}</p>
      )}
      <div className="mt-5 space-y-3">
        {isLoading ? (
          <p className="text-sm text-gray-600">Loading...</p>
        ) : visibleAlertItems.length === 0 ? (
          <p className="text-sm text-gray-600">No alerts right now.</p>
        ) : (
          visibleAlertItems.map((alert) => {
            const isEditing = editingAlertKey === alert.key;
            const isSubmitting = alertActionSubmitting === alert.key;
            return (
              <div key={alert.key} className="rounded-lg bg-amber-50 p-3.5">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${SEVERITY_DOT_CLASSES[alert.severity ?? ALERT_SEVERITY[alert.alertType]]}`}
                    aria-hidden="true"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-950">
                      {alertTitle(alert)}
                    </p>
                    <p className="text-xs text-gray-600">{alert.detail}</p>

                    {(alert.alertType === "faceMismatch" || alert.alertType === "faceNoFace") &&
                      alert.event && (
                        <div className="mt-3 grid max-w-xs grid-cols-2 gap-2">
                          <div>
                            <p className="mb-1 text-center text-xs text-gray-500">Clock photo</p>
                            <div className="aspect-square overflow-hidden rounded-md bg-gray-100">
                              <ClockPhoto event={alert.event} alt="Clock photo" emptyText="No photo" />
                            </div>
                          </div>
                          <div>
                            <p className="mb-1 text-center text-xs text-gray-500">Profile photo</p>
                            <div className="aspect-square overflow-hidden rounded-md bg-gray-100">
                              <ReferencePhoto
                                url={alert.event.faceCheck?.referencePhotoUrl}
                                alt="Employee profile photo"
                              />
                            </div>
                          </div>
                          {faceResultText(alert.event.faceCheck) && (
                            <p className="col-span-2 text-center text-xs text-gray-600">
                              Face check: {faceResultText(alert.event.faceCheck)}
                            </p>
                          )}
                        </div>
                      )}

                    {alert.alertType === "employeeUpdated" && alert.employeeUpdate && (
                      <div className="mt-3">
                        {alert.employeeUpdate.changedFields.includes("name") && (
                          <p className="text-xs text-gray-600">
                            Name: {alert.employeeUpdate.oldName} -&gt; {alert.employeeUpdate.newName}
                          </p>
                        )}
                        {alert.employeeUpdate.changedFields.includes("photo") && (
                          <div className="mt-2 grid max-w-xs grid-cols-2 gap-2">
                            <div>
                              <p className="mb-1 text-center text-xs text-gray-500">Previous photo</p>
                              <div className="aspect-square overflow-hidden rounded-md bg-gray-100">
                                {alert.employeeUpdate.oldPhotoUrl ? (
                                  <img
                                    src={alert.employeeUpdate.oldPhotoUrl}
                                    alt="Previous photo"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xs text-gray-600">
                                    No photo
                                  </div>
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="mb-1 text-center text-xs text-gray-500">New photo</p>
                              <div className="aspect-square overflow-hidden rounded-md bg-gray-100">
                                {alert.employeeUpdate.newPhotoUrl ? (
                                  <img
                                    src={alert.employeeUpdate.newPhotoUrl}
                                    alt="New photo"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xs text-gray-600">
                                    No photo
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        <p className="mt-2 text-xs text-gray-500">
                          {alert.employeeUpdate.updatedByName}
                          {alert.employeeUpdate.updatedByDeviceName
                            ? ` - ${alert.employeeUpdate.updatedByDeviceName}`
                            : ""}
                          {" - "}
                          {alert.employeeUpdate.createdAt?.toDate().toLocaleString()}
                        </p>
                      </div>
                    )}

                    {isEditing ? (
                      <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-white p-3">
                        <label className="block text-xs font-medium text-gray-600">
                          {alert.alertType === "clockedInOutsideGeofence"
                            ? "Clock-in time"
                            : "Clock-out time"}
                        </label>
                        <input
                          type="datetime-local"
                          value={editTimeValue}
                          onChange={(e) => {
                            setPendingClockInEdit(null);
                            setEditTimeValue(e.target.value);
                          }}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        />
                        {pendingClockInEdit?.alertKey === alert.key && (
                          <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-2 text-xs text-gray-800">
                            <p className="font-medium text-gray-950">
                              Change this clock-in from {new Date(pendingClockInEdit.oldMs).toLocaleString()} to{" "}
                              {new Date(pendingClockInEdit.newMs).toLocaleString()}?
                            </p>
                            {pendingClockInEdit.neighbours.prev && (
                              <p className="mt-1 text-gray-600">
                                Before it: {clockEventTypeLabel(pendingClockInEdit.neighbours.prev.type)} at{" "}
                                {new Date(pendingClockInEdit.neighbours.prev.ms).toLocaleString()}
                              </p>
                            )}
                            {pendingClockInEdit.neighbours.next && (
                              <p className="mt-1 text-gray-600">
                                After it: {clockEventTypeLabel(pendingClockInEdit.neighbours.next.type)} at{" "}
                                {new Date(pendingClockInEdit.neighbours.next.ms).toLocaleString()}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isSubmitting || !editTimeValue}
                            onClick={() => handleSubmitEditTime(alert)}
                            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSubmitting
                              ? "Saving..."
                              : pendingClockInEdit?.alertKey === alert.key
                                ? "Confirm"
                                : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEditTime}
                            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-3">
                        {actionBlocked(alert) && (
                          <span className="text-xs text-gray-500">{actionBlocked(alert)}</span>
                        )}
                        {alert.alertType === "breakTooLong" && !actionBlocked(alert) && (
                          <>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleEndBreakFromAlert(alert)}
                              className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              End Break
                            </button>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleStartEditTime(alert)}
                              className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Edit Time
                            </button>
                          </>
                        )}
                        {(alert.alertType === "maxHours" || alert.alertType === "missedClockOut") && !actionBlocked(alert) && (
                          <>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleClockOutFromAlert(alert)}
                              className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Clock Out
                            </button>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleStartEditTime(alert)}
                              className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Edit Time
                            </button>
                          </>
                        )}
                        {alert.alertType === "clockedInOutsideGeofence" && !actionBlocked(alert) && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleStartEditTime(alert)}
                            className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Edit Time
                          </button>
                        )}
                        {(alert.alertType === "faceMismatch" || alert.alertType === "faceNoFace") && !actionBlocked(alert) && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleConfirmFaceMatch(alert)}
                            className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Confirmed it&apos;s them
                          </button>
                        )}
                        {alert.alertType === "faceBadReference" && (
                          <Link
                            href={`/dashboard/employees?openEmployee=${alert.employeeId}`}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Update photo
                          </Link>
                        )}
                        {/* faceBadReference has no Ignore - it auto-resolves
                            server-side once the pfp passes again, there's
                            nothing to dismiss in the meantime. */}
                        {alert.alertType !== "faceBadReference" && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleIgnoreAlert(alert)}
                            className="text-xs font-medium text-gray-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSubmitting ? "Working..." : "Ignore"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {!isLoading && alertsCapNote(serverAlerts.length) && (
        <p className="mt-3 text-xs text-gray-600">{alertsCapNote(serverAlerts.length)}</p>
      )}
      </>
      )}
    </div>
  );
}
