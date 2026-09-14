import type { CompanySettings } from "@/lib/hooks/useCompanySettings";
import type { ClockEvent, Employee } from "@/lib/types";

export type DayAttendance = {
  label: string;
  count: number;
};

export type AlertItem = {
  key: string;
  alertType: "maxHours" | "missedClockOut" | "overtime" | "breakTooLong";
  label: string;
  detail: string;
  employeeId: string;
  event?: ClockEvent;
};

// A correction (correctClockEvent) intentionally never touches the raw
// `timestamp` field - only `adjustedTimestamp`. Anything on this page that
// judges an employee's CURRENT status (who's active, who's on break, elapsed
// hours, alert day-checks) must use the effective time below, or a back-dated
// correction can silently desync the live view from reality. Raw `timestamp`
// stays reserved for Firestore query bounds only, matching the same
// intentional split used in useReports.ts.
export function effectiveTimestamp(event: ClockEvent) {
  return event.adjustedTimestamp ?? event.timestamp;
}

export function effectiveDate(event: ClockEvent): Date | null {
  const ts = effectiveTimestamp(event);
  return ts ? ts.toDate() : null;
}

export function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Formats accumulated worked ms as "Xh Ym" (or just "Ym" under an hour).
// Used for the "Employees clocked in" table and anywhere else that needs to
// show total worked time for the current shift with breaks excluded.
export function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / (1000 * 60)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export function dateKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function buildAlertItems({
  settings,
  currentlyActive,
  currentlyOnBreak,
  weeklyHoursByEmployee,
  workedMsByEmployee,
  employees,
}: {
  settings: CompanySettings;
  currentlyActive: ClockEvent[];
  currentlyOnBreak: ClockEvent[];
  weeklyHoursByEmployee: Map<string, number>;
  workedMsByEmployee: Map<string, number>;
  employees: Employee[];
}): AlertItem[] {
  const alertItems: AlertItem[] = [];
  const now = new Date();

  if (settings.alerts.maxHoursWarning) {
    currentlyActive
      .filter((event) => {
        const d = effectiveDate(event);
        return d && isSameDay(d, now);
      })
      .forEach((event) => {
        const d = effectiveDate(event)!;
        const workedMs = workedMsByEmployee.get(event.employeeId) ?? 0;
        const workedHours = workedMs / (1000 * 60 * 60);
        if (workedHours >= settings.alerts.maxHoursThreshold) {
          alertItems.push({
            key: `max-${event.employeeId}-${dateKey(d)}`,
            alertType: "maxHours",
            label: event.employeeName,
            detail: `Worked ${workedHours.toFixed(1)}h today (breaks excluded) - check in?`,
            employeeId: event.employeeId,
            event,
          });
        }
      });
  }

  if (settings.alerts.missedClockOutAlert && !settings.attendanceRules.autoClockOut) {
    currentlyActive
      .filter((event) => {
        const d = effectiveDate(event);
        return d && !isSameDay(d, now);
      })
      .forEach((event) => {
        const d = effectiveDate(event)!;
        alertItems.push({
          key: `missed-${event.employeeId}-${dateKey(d)}`,
          alertType: "missedClockOut",
          label: event.employeeName,
          detail: `Still clocked in from ${d.toLocaleDateString()} - missed clock-out.`,
          employeeId: event.employeeId,
          event,
        });
      });
  }

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

  return alertItems;
}
