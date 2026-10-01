"use client";

import { useState } from "react";
import { useCompanySettings } from "@/lib/hooks/useCompanySettings";
import { useAlertActions } from "@/lib/hooks/useAlertActions";
import { useServerAlerts } from "@/lib/hooks/useServerAlerts";
import type { ClockEvent } from "@/lib/types";
import {
  ALERT_SEVERITY,
  AlertItem,
  AlertSeverity,
  alertTitle,
  buildGeofenceAlertItems,
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
  // Geofencing (Pro) Part 4 only - buildGeofenceAlertItems needs the raw
  // recent events (not just currentlyActive) since its alerts are about a
  // past clock-in moment, not current status.
  recentEvents: ClockEvent[];
}) {
  const { settings, isPro } = useCompanySettings();
  const { alerts: serverAlerts, loading: alertsLoading } = useServerAlerts();
  const {
    resolvedKeys,
    ignoreAlert,
    clockOutFromAlert,
    endBreakFromAlert,
    submitEditTimeFromAlert,
    editClockInTimeFromAlert,
  } = useAlertActions();

  const [editingAlertKey, setEditingAlertKey] = useState<string | null>(null);
  const [editTimeValue, setEditTimeValue] = useState("");
  const [alertActionSubmitting, setAlertActionSubmitting] = useState<string | null>(null);
  const [alertActionError, setAlertActionError] = useState<string | null>(null);

  // currentlyActive already carries each employee's latest event (whether
  // that's an "in" or a still-open "breakStart") - see useDashboardStatus's
  // derivation - so a single map covers both the maxHours/missedClockOut
  // and breakTooLong action buttons below.
  const eventByEmployee = new Map<string, ClockEvent>();
  currentlyActive.forEach((e) => eventByEmployee.set(e.employeeId, e));

  const serverAlertItems: AlertItem[] = serverAlerts.map((a) => ({
    ...a,
    event: eventByEmployee.get(a.employeeId),
  }));

  // Geofencing (Pro) Part 4 - not yet migrated server-side (see
  // buildGeofenceAlertItems's comment), so these are still computed here
  // and merged in alongside the server-generated alerts above.
  const geofenceAlertItems = buildGeofenceAlertItems({
    settings,
    isPro,
    recentEvents,
  });

  const alertItems: AlertItem[] = [...serverAlertItems, ...geofenceAlertItems];
  const visibleAlertItems = alertItems.filter((a) => !resolvedKeys.has(a.key));
  const isLoading = loading || alertsLoading;

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
      <h2 className="text-base font-semibold text-gray-950">Alerts</h2>
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
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleIgnoreAlert(alert)}
                          className="text-xs font-medium text-gray-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSubmitting ? "Working..." : "Ignore"}
                        </button>
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
