$path = ".\app\dashboard\page.tsx"
$raw = Get-Content $path -Raw
# Normalize to LF for reliable matching, convert back to CRLF before saving
$content = $raw -replace "`r`n", "`n"

# 1. AlertItem type
$old1 = @'
type AlertItem = {
  key: string;
  alertType: "maxHours" | "missedClockOut" | "overtime";
  label: string;
  detail: string;
  employeeId: string;
  event?: ClockEvent;
};
'@
$new1 = @'
type AlertItem = {
  key: string;
  alertType: "maxHours" | "missedClockOut" | "overtime" | "breakTooLong";
  label: string;
  detail: string;
  employeeId: string;
  event?: ClockEvent;
};
'@
if ($content.IndexOf($old1) -eq -1) {
  Write-Host "FAILED: AlertItem type" -ForegroundColor Red
} else {
  $content = $content.Replace($old1, $new1)
  Write-Host "OK: AlertItem type" -ForegroundColor Green
}

# 2. recordAlertAction signature
$old2 = @'
  async function recordAlertAction(
    alert: AlertItem,
    status: "ignored" | "resolved",
    actionTaken?: "clockOut" | "editTime"
  ) {
'@
$new2 = @'
  async function recordAlertAction(
    alert: AlertItem,
    status: "ignored" | "resolved",
    actionTaken?: "clockOut" | "editTime" | "endBreak"
  ) {
'@
if ($content.IndexOf($old2) -eq -1) {
  Write-Host "FAILED: recordAlertAction signature" -ForegroundColor Red
} else {
  $content = $content.Replace($old2, $new2)
  Write-Host "OK: recordAlertAction signature" -ForegroundColor Green
}

# 3. breakTooLong alertItems.push block
$old3 = @'
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
$new3 = @'
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
if ($content.IndexOf($old3) -eq -1) {
  Write-Host "FAILED: overtime alertItems block" -ForegroundColor Red
} else {
  $content = $content.Replace($old3, $new3)
  Write-Host "OK: breakTooLong alertItems block added" -ForegroundColor Green
}

# 4. New handleEndBreakFromAlert handler (note the blank line before handleStartEditTime)
$old4 = @'
    } catch (err) {
      console.error("Clock out from alert error:", err);
      setAlertActionError("Couldn't clock out. Try again.");
    } finally {
      setAlertActionSubmitting(null);
    }
  }

  function handleStartEditTime(alert: AlertItem) {
'@
$new4 = @'
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
if ($content.IndexOf($old4) -eq -1) {
  Write-Host "FAILED: handleEndBreakFromAlert insertion point" -ForegroundColor Red
} else {
  $content = $content.Replace($old4, $new4)
  Write-Host "OK: handleEndBreakFromAlert added" -ForegroundColor Green
}

# 5. Button block
$old5 = @'
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
$new5 = @'
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
if ($content.IndexOf($old5) -eq -1) {
  Write-Host "FAILED: button block" -ForegroundColor Red
} else {
  $content = $content.Replace($old5, $new5)
  Write-Host "OK: Alert card buttons updated" -ForegroundColor Green
}

# Convert back to CRLF (matching original file) and save
$content = $content -replace "`n", "`r`n"
$content | Set-Content -Path $path -Encoding ascii -NoNewline

Write-Host ""
Write-Host "===== Verification ====="
Select-String -Path .\app\dashboard\page.tsx -Pattern "breakTooLong|handleEndBreakFromAlert"
