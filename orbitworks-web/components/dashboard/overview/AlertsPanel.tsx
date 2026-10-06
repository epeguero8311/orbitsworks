"use client";

import { useState } from "react";
import Link from "next/link";
import { useAlertActions } from "@/lib/hooks/useAlertActions";
import { useServerAlerts } from "@/lib/hooks/useServerAlerts";
import type { ClockEvent } from "@/lib/types";
import {
  ALERT_SEVERITY,
  AlertItem,
  AlertSeverity,
  alertTitle,
  effectiveDate,
  toDatetimeLocalValue,
} from "@/lib/dashboardOverviewUtils";

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

  const [editingAlertKey, setEditingAlertKey] = useState<string | null>(null);
  const [editTimeValue, setEditTimeValue] = useState("");
  const [alertActionSubmitting, setAlertActionSubmitting] = useState<string | null>(null);
  const [alertActionError, setAlertActionError] = useState<string | null>(null);
  const [ignoringAll, setIgnoringAll] = useState(false);

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
  ]);

  const alertItems: AlertItem[] = serverAlerts.map((a) => ({
    ...a,
    event:
      EVENT_SCOPED_ALERT_TYPES.has(a.alertType) && a.eventId
        ? eventById.get(a.eventId) ?? eventByEmployee.get(a.employeeId)
        : eventByEmployee.get(a.employeeId),
  }));
  const visibleAlertItems = alertItems.filter((a) => !resolvedKeys.has(a.key));
  const isLoading = loading || alertsLoading;

  async function handleIgnoreAll() {
    setIgnoringAll(true);
    setAlertActionError(null);
    try {
      // faceBadReference has no Ignore (individually or in bulk) - it
      // auto-resolves server-side, never via alertActions.
      await ignoreAll(visibleAlertItems.filter((a) => a.alertType !== "faceBadReference"));
    } catch (err) {
      console.error("Ignore all alerts error:", err);
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
        await editClockInTimeFromAlert(alert, chosenMs);
      } else {
        await submitEditTimeFromAlert(alert, chosenMs);
      }
      setEditingAlertKey(null);
      setEditTimeValue("");
    } catch (err) {
      console.error("Edit time from alert error:", err);
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
        <h2 className="text-base font-semibold text-gray-950">Alerts</h2>
        {visibleAlertItems.length > 0 && (
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
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${SEVERITY_DOT_CLASSES[ALERT_SEVERITY[alert.alertType]]}`}
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
                              {alert.event.photoUrl ? (
                                <img
                                  src={alert.event.photoUrl}
                                  alt="Clock photo"
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
                            <p className="mb-1 text-center text-xs text-gray-500">Profile photo</p>
                            <div className="aspect-square overflow-hidden rounded-md bg-gray-100">
                              {alert.event.faceCheck?.referencePhotoUrl ? (
                                <img
                                  src={alert.event.faceCheck.referencePhotoUrl}
                                  alt="Employee profile photo"
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
                          onChange={(e) => setEditTimeValue(e.target.value)}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        />
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isSubmitting || !editTimeValue}
                            onClick={() => handleSubmitEditTime(alert)}
                            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSubmitting ? "Saving..." : "Save"}
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
                        {alert.alertType === "breakTooLong" && (
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
                        {(alert.alertType === "maxHours" || alert.alertType === "missedClockOut") && (
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
                        {alert.alertType === "clockedInOutsideGeofence" && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleStartEditTime(alert)}
                            className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Edit Time
                          </button>
                        )}
                        {(alert.alertType === "faceMismatch" || alert.alertType === "faceNoFace") && (
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
    </div>
  );
}
