"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAlertActions } from "@/lib/hooks/useAlertActions";
import { useServerAlerts } from "@/lib/hooks/useServerAlerts";
import type { ClockEvent } from "@/lib/types";
import { AlertItem, effectiveDate, toDatetimeLocalValue } from "@/lib/dashboardOverviewUtils";

export default function AlertsPanel({
  loading,
  currentlyActive,
}: {
  loading: boolean;
  currentlyActive: ClockEvent[];
}) {
  const { alerts: serverAlerts, loading: alertsLoading } = useServerAlerts();
  const {
    resolvedKeys,
    ignoreAlert,
    clockOutFromAlert,
    endBreakFromAlert,
    submitEditTimeFromAlert,
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

  const alertItems: AlertItem[] = serverAlerts.map((a) => ({
    ...a,
    event: eventByEmployee.get(a.employeeId),
  }));
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
      await submitEditTimeFromAlert(alert, chosenMs);
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
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-950">
                      {alert.label}
                    </p>
                    <p className="text-xs text-gray-600">{alert.detail}</p>

                    {isEditing ? (
                      <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-white p-3">
                        <label className="block text-xs font-medium text-gray-600">
                          Clock-out time
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
