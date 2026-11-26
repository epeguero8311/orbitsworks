import type { CompanySettings } from "@/lib/hooks/useCompanySettings";
import type { OvertimeReportRow } from "@/lib/reportOvertime";
import type { PayrollOvertimeExport, PayrollTipsExport } from "@/lib/reportExcelUtils";

// Reports: which company settings a report run was computed with.
//
// Bug fixed Nov 26: the Reports page ran its first report before the
// company settings had loaded, so it used the defaults (Overtime OFF, Tips
// OFF) and never ran again; the Excel then mixed that data with the loaded
// settings (Tips column of $0.00, no Overtime columns). Now the run waits
// for the settings, re-runs when one of these changes, and the downloads
// follow the settings saved with the data (never the live ones).

// Everything in the settings that changes a report's numbers or columns.
// A change to any of these re-runs the report; anything else on the
// company doc (alerts, plan, employee count...) does not.
export function reportSettingsKey(settings: CompanySettings): string {
  return JSON.stringify([
    settings.overtimeEnabled,
    settings.weeklyOvertimeThreshold,
    settings.dailyOvertimeThreshold,
    settings.overtimeWeekStartsOn,
    settings.overtimeMultiplier,
    settings.overtimeRoundMinutes,
    settings.timeZone,
    settings.tipsEnabled,
    settings.exportSettings,
    settings.businessHours.open,
    settings.attendanceRules.gracePeriodMinutes ?? 0,
  ]);
}

// Saved with each report run's data.
export type ReportComputedWith = {
  overtimeEnabled: boolean;
  tipsEnabled: boolean;
  overtimeMultiplier: number;
};

export function reportComputedWith(settings: CompanySettings): ReportComputedWith {
  return {
    overtimeEnabled: settings.overtimeEnabled,
    tipsEnabled: settings.tipsEnabled,
    overtimeMultiplier: settings.overtimeMultiplier,
  };
}

// The Overtime / Tips arguments for the Payroll Hours sheet, from the run's
// own data: Overtime layout only when that run built Overtime rows, Tips
// column only when that run read tips.
export function payrollExportOptions(data: {
  overtimeRows: OvertimeReportRow[] | null;
  tipsByEmployeeDay: Map<string, number>;
  computedWith: ReportComputedWith;
}): { overtime: PayrollOvertimeExport | null; tips: PayrollTipsExport | null } {
  return {
    overtime: data.overtimeRows ? { rows: data.overtimeRows, multiplier: data.computedWith.overtimeMultiplier } : null,
    tips: data.computedWith.tipsEnabled ? { byEmployeeDay: data.tipsByEmployeeDay } : null,
  };
}
