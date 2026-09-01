# ===== 1. lib/hooks/useCompanySettings.ts =====
$path = ".\lib\hooks\useCompanySettings.ts"
$content = Get-Content $path -Raw

$old1 = @'
export type Alerts = {
  maxHoursWarning: boolean;
  maxHoursThreshold: number;
  overtimeWarning: boolean;
  missedClockOutAlert: boolean;
  missedClockOutMinutes: number;
};
'@
$new1 = @'
export type Alerts = {
  maxHoursWarning: boolean;
  maxHoursThreshold: number;
  overtimeWarning: boolean;
  missedClockOutAlert: boolean;
  missedClockOutMinutes: number;
  maxBreakWarning: boolean;
  maxBreakMinutes: number;
};
'@

if ($content.IndexOf($old1) -eq -1) {
  Write-Host "FAILED to find Alerts type block in useCompanySettings.ts" -ForegroundColor Red
} else {
  $content = $content.Replace($old1, $new1)
  Write-Host "OK: Alerts type updated" -ForegroundColor Green
}

$old2 = @'
export const DEFAULT_ALERTS: Alerts = {
  maxHoursWarning: true,
  maxHoursThreshold: 8,
  overtimeWarning: true,
  missedClockOutAlert: true,
  missedClockOutMinutes: 30,
};
'@
$new2 = @'
export const DEFAULT_ALERTS: Alerts = {
  maxHoursWarning: true,
  maxHoursThreshold: 8,
  overtimeWarning: true,
  missedClockOutAlert: true,
  missedClockOutMinutes: 30,
  maxBreakWarning: true,
  maxBreakMinutes: 15,
};
'@

if ($content.IndexOf($old2) -eq -1) {
  Write-Host "FAILED to find DEFAULT_ALERTS block in useCompanySettings.ts" -ForegroundColor Red
} else {
  $content = $content.Replace($old2, $new2)
  Write-Host "OK: DEFAULT_ALERTS updated" -ForegroundColor Green
}

$content | Set-Content -Path $path -Encoding ascii -NoNewline


# ===== 2. app/dashboard/settings/page.tsx =====
$path = ".\app\dashboard\settings\page.tsx"
$content = Get-Content $path -Raw

$old3 = @'
              <div className="py-1">
                <Toggle
                  label="Missed clock out alert"
                  checked={alerts.missedClockOutAlert}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, missedClockOutAlert: v }))}
                />
                <ThresholdField
                  label="Alert after:"
                  suffix="minutes"
                  value={alerts.missedClockOutMinutes}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, missedClockOutMinutes: v }))}
                />
              </div>
            </div>
'@
$new3 = @'
              <div className="py-1">
                <Toggle
                  label="Missed clock out alert"
                  checked={alerts.missedClockOutAlert}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, missedClockOutAlert: v }))}
                />
                <ThresholdField
                  label="Alert after:"
                  suffix="minutes"
                  value={alerts.missedClockOutMinutes}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, missedClockOutMinutes: v }))}
                />
              </div>

              <div className="py-1">
                <Toggle
                  label="Max break time warning"
                  checked={alerts.maxBreakWarning}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, maxBreakWarning: v }))}
                />
                <ThresholdField
                  label="Warning after:"
                  suffix="minutes"
                  value={alerts.maxBreakMinutes}
                  onChange={(v) => setAlerts((prev) => ({ ...prev, maxBreakMinutes: v }))}
                />
              </div>
            </div>
'@

if ($content.IndexOf($old3) -eq -1) {
  Write-Host "FAILED to find Missed clock out alert block in settings/page.tsx" -ForegroundColor Red
} else {
  $content = $content.Replace($old3, $new3)
  Write-Host "OK: Settings page Alerts card updated" -ForegroundColor Green
}

$content | Set-Content -Path $path -Encoding ascii -NoNewline


# ===== 3. app/dashboard/page.tsx =====
$path = ".\app\dashboard\page.tsx"
$content = Get-Content $path -Raw

# 3a. AlertItem type
$old4 = @'
type AlertItem = {
  key: string;
  alertType: "maxHours" | "missedClockOut" | "overtime";
  label: string;
  detail: string;
  employeeId: string;
  event?: ClockEvent;
};
'@
$new4 = @'
type AlertItem = {
  key: string;
  alertType: "maxHours" | "missedClockOut" | "overtime" | "breakTooLong";
  label: string;
  detail: string;
  employeeId: string;
  event?: ClockEvent;
};
'@

if ($content.IndexOf($old4) -eq -1) {
  Write-Host "FAILED to find AlertItem type in dashboard/page.tsx" -ForegroundColor Red
} else {
  $content = $content.Replace($old4, $new4)
  Write-Host "OK: AlertItem type updated" -ForegroundColor Green
}

# 3b. recordAlertAction actionTaken param
$old5 = @'
  async function recordAlertAction(
    alert: AlertItem,
    status: "ignored" | "resolved",
    actionTaken?: "clockOut" | "editTime"
  ) {
'@
$new5 = @'
  async function recordAlertAction(
    alert: AlertItem,
    status: "ignored" | "resolved",
    actionTaken?: "clockOut" | "editTime" | "endBreak"
  ) {
'@

if ($content.IndexOf($old5) -eq -1) {
  Write-Host "FAILED to find recordAlertAction signature in dashboard/page.tsx" -ForegroundColor Red
} else {
  $content = $content.Replace($old5, $new5)
  Write-Host "OK: recordAlertAction signature updated" -ForegroundColor Green
}

# 3c. New breakTooLong alertItems.push block
$old6 = @'
  if (settings.alerts.overtimeWarning) {
    const weekStartStr = dateKey(getWeekStart(now));
    for (const [employeeId, hours] of weeklyHoursByEmployee) {
      if (hours > settings.weeklyOvertimeThreshold) {
        const employee = employees.find((e) => e.id === employeeId);
        alertItems.push({
          key: `ot-${employeeId}-${weekStartStr}`,
          alertType: "overtime",
          label: employee?.name ?? "Unknown employee",
          detail: `${hours.toFixed(1)}h this week - over the ${settings.weeklyOvertimeThreshold}h threshold.`,
          employeeId,
        });
      }
    }
  }

  const visibleAlertItems = alertItems.filter((a) => !resolvedKeys.has(a.key));
'@
$new6 = @'
  if (settings.alerts.overtimeWarning) {
    const weekStartStr = dateKey(getWeekStart(now));
    for (const [employeeId, hours] of weeklyHoursByEmployee) {
      if (hours > settings.weeklyOvertimeThreshold) {
        const employee = employees.find((e) => e.id === employeeId);
        alertItems.push({
          key: `ot-${employeeId}-${weekStartStr}`,
          alertType: "overtime",
          label: employee?.name ?? "Unknown employee",
          detail: `${hours.toFixed(1)}h this week - over the ${settings.weeklyOvertimeThreshold}h threshold.`,
          employeeId,
        });
      }
    }
  }

  if (settings.alerts.maxBreakWarning) {
    currentlyOnBreak.forEach((event) => {
      const d = effectiveDate(event);
      if (!d) return;
      const elapsedMinutes = (Date.now() - d.getTime()) / (1000 * 60);
      if (elapsedMinutes >= settings.alerts.maxBreakMinutes) {
        alertItems.push({
          key: `break-${event.employeeId}-${dateKey(d)}`,
          alertType: "breakTooLong",
          label: event.employeeName,
          detail: `On break for ${elapsedMinutes.toFixed(0)}m - over the ${settings.alerts.maxBreakMinutes}m limit.`,
          employeeId: event.employeeId,
          event,
        });
      }
    });
  }

  const visibleAlertItems = alertItems.filter((a) => !resolvedKeys.has(a.key));
'@

if ($content.IndexOf($old6) -eq -1) {
  Write-Host "FAILED to find overtime alertItems block in dashboard/page.tsx" -ForegroundColor Red
} else {
  $content = $content.Replace($old6, $new6)
  Write-Host "OK: breakTooLong alertItems block added" -ForegroundColor Green
}

# 3d. New handleEndBreakFromAlert handler
$old7 = @'
      await recordAlertAction(alert, "resolved", "clockOut");
    } catch (err) {
      console.error("Clock out from alert error:", err);
      setAlertActionError("Couldn't clock out. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }
  function handleStartEditTime(alert: AlertItem) {
'@
$new7 = @'
      await recordAlertAction(alert, "resolved", "clockOut");
    } catch (err) {
      console.error("Clock out from alert error:", err);
      setAlertActionError("Couldn't clock out. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }
  async function handleEndBreakFromAlert(alert: AlertItem) {
    if (!alert.event || !userData?.companyId) return;
    setAlertActionSubmitting(alert.key);
    setAlertActionError(null);
    try {
      const eventsRef = collection(
        db,
        "companies",
        userData.companyId,
        "clockEvents"
      );
      await addDoc(eventsRef, {
        employeeId: alert.event.employeeId,
        employeeName: alert.event.employeeName,
        siteId: alert.event.siteId,
        siteName: alert.event.siteName,
        subcontractorId: alert.event.subcontractorId ?? null,
        subcontractorName: alert.event.subcontractorName ?? null,
        type: "breakEnd",
        source: "adminManual",
        note: "Break ended from alert",
        createdByUid: currentUser?.uid,
        timestamp: Timestamp.fromDate(new Date()),
        createdAt: serverTimestamp(),
      });
      await recordAlertAction(alert, "resolved", "endBreak");
    } catch (err) {
      console.error("End break from alert error:", err);
      setAlertActionError("Couldn't end break. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }
  function handleStartEditTime(alert: AlertItem) {
'@

if ($content.IndexOf($old7) -eq -1) {
  Write-Host "FAILED to find handleClockOutFromAlert/handleStartEditTime boundary in dashboard/page.tsx" -ForegroundColor Red
} else {
  $content = $content.Replace($old7, $new7)
  Write-Host "OK: handleEndBreakFromAlert added" -ForegroundColor Green
}

# 3e. Button block
$old8 = @'
                        <div className="mt-2 flex flex-wrap gap-3">
                          {alert.alertType !== "overtime" && (
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
'@
$new8 = @'
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
                          {alert.alertType !== "overtime" && alert.alertType !== "breakTooLong" && (
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
'@

if ($content.IndexOf($old8) -eq -1) {
  Write-Host "FAILED to find button block in dashboard/page.tsx" -ForegroundColor Red
} else {
  $content = $content.Replace($old8, $new8)
  Write-Host "OK: Alert card buttons updated" -ForegroundColor Green
}

$content | Set-Content -Path $path -Encoding ascii -NoNewline

Write-Host ""
Write-Host "===== Verification ====="
Select-String -Path ".\lib\hooks\useCompanySettings.ts" -Pattern "maxBreakMinutes"
Select-String -Path ".\app\dashboard\settings\page.tsx" -Pattern "Max break time warning"
Select-String -Path ".\app\dashboard\page.tsx" -Pattern "breakTooLong|handleEndBreakFromAlert"
