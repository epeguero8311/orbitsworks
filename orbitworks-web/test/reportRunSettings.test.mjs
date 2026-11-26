// Reports first-run timing fix (Nov 26): the downloads follow the settings
// the report data was computed with, and a report setting change re-runs
// the report. Regression data = OT Test Co (dev) Emilio, Nov 23-26 2026.
// Plain Node, no emulator. Run via: node --test test/reportRunSettings.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const { payrollExportOptions, reportComputedWith, reportSettingsKey } = await import("../lib/reportRunSettings.ts");
const { buildOvertimeReportRows } = await import("../lib/reportOvertime.ts");
const { addPayrollSheetWithOvertime } = await import("../lib/payrollExcelSheets.ts");

const SETTINGS = {
  name: "OT Test Co",
  logoUrl: null,
  businessHours: { open: "08:00", close: "17:00" },
  weeklyOvertimeThreshold: 40,
  overtimeMultiplier: 1.5,
  overtimeEnabled: true,
  dailyOvertimeThreshold: 8,
  overtimeWeekStartsOn: 1,
  overtimeRoundMinutes: 0,
  timeZone: "America/Chicago",
  attendanceRules: { gracePeriodMinutes: 0 },
  alerts: { lateClockInAlert: true },
  appSettings: {},
  exportSettings: { roundDailyMinutes: 0, roundTotalMinutes: 0, automaticBreakMinutes: 0, minimumShiftHours: 0 },
  faceVerification: { alertsEnabled: true },
  autoClockOut: {},
  approvalsColumns: null,
  tipsEnabled: true,
};

test("reportSettingsKey changes for every setting that changes report numbers or columns", () => {
  const base = reportSettingsKey(SETTINGS);
  const changes = [
    { overtimeEnabled: false },
    { tipsEnabled: false },
    { weeklyOvertimeThreshold: 45 },
    { dailyOvertimeThreshold: 0 },
    { overtimeWeekStartsOn: 0 },
    { overtimeMultiplier: 2 },
    { overtimeRoundMinutes: 15 },
    { timeZone: "America/New_York" },
    { exportSettings: { ...SETTINGS.exportSettings, roundDailyMinutes: 15 } },
    { exportSettings: { ...SETTINGS.exportSettings, automaticBreakMinutes: 30 } },
    { businessHours: { open: "07:00", close: "17:00" } },
    { attendanceRules: { gracePeriodMinutes: 5 } },
  ];
  for (const c of changes) assert.notEqual(reportSettingsKey({ ...SETTINGS, ...c }), base, JSON.stringify(c));
});

test("reportSettingsKey ignores company doc changes that don't touch reports", () => {
  const base = reportSettingsKey(SETTINGS);
  for (const c of [{ name: "Renamed" }, { alerts: { lateClockInAlert: false } }, { approvalsColumns: ["tips"] }, { logoUrl: "x" }]) {
    assert.equal(reportSettingsKey({ ...SETTINGS, ...c }), base, JSON.stringify(c));
  }
});

test("reportComputedWith saves the Overtime / Tips / multiplier the run used", () => {
  assert.deepEqual(reportComputedWith(SETTINGS), { overtimeEnabled: true, tipsEnabled: true, overtimeMultiplier: 1.5 });
  assert.deepEqual(reportComputedWith({ ...SETTINGS, overtimeEnabled: false, tipsEnabled: false, overtimeMultiplier: 2 }), {
    overtimeEnabled: false,
    tipsEnabled: false,
    overtimeMultiplier: 2,
  });
});

test("payrollExportOptions: the bug - data run with defaults never gets a Tips column of $0 or a live Overtime choice", () => {
  // What the first run produced before the fix: Overtime OFF, Tips OFF
  // (no tips read). Live settings had both ON - the export must follow
  // the data, not the live settings.
  const stale = payrollExportOptions({
    overtimeRows: null,
    tipsByEmployeeDay: new Map(),
    computedWith: { overtimeEnabled: false, tipsEnabled: false, overtimeMultiplier: 1.5 },
  });
  assert.equal(stale.overtime, null);
  assert.equal(stale.tips, null);
});

test("payrollExportOptions: a run with Overtime + Tips ON exports both, multiplier from the run", () => {
  const rows = [{ key: "x" }];
  const tips = new Map([["kiosk-admin__2026-11-26", 234]]);
  const out = payrollExportOptions({
    overtimeRows: rows,
    tipsByEmployeeDay: tips,
    computedWith: { overtimeEnabled: true, tipsEnabled: true, overtimeMultiplier: 2 },
  });
  assert.deepEqual(out.overtime, { rows, multiplier: 2 });
  assert.equal(out.tips.byEmployeeDay, tips);
});

// ---- Regression: OT Test Co, Emilio (kiosk-admin), Nov 23-26 2026 ----
// Exact clock-in/out + break ms from dev. All approved; frozen OT 0, rate
// $15 / OT $22.50; tips $100 + $67 + $67 on three Nov 26 shifts.
const EMILIO_SHIFTS = [
  // Wed Nov 25 7:10:49-7:11:20 PM Chicago = Nov 26 01:10 UTC.
  { id: "b58ca808", startMs: 1795655449679, endMs: 1795655480551, breakMs: 15829 },
  { id: "852d03f2", startMs: 1795703916449, endMs: 1795708055378, breakMs: 532029 },
  { id: "ddccba1a", startMs: 1795708081486, endMs: 1795715460484, breakMs: 336269 },
  { id: "b3805431", startMs: 1795716364827, endMs: 1795721247058, breakMs: 3415382 },
  { id: "df87aba2", startMs: 1795722028059, endMs: 1795725437556, breakMs: 3308240 },
  { id: "94c5adf8", startMs: 1795725456563, endMs: 1795726232810, breakMs: 0 },
].map((s) => ({ ...s, employeeId: "kiosk-admin" }));

function emilioRows() {
  const frozenRates = new Map(EMILIO_SHIFTS.map((s) => [s.id, { rate: 15, overtimeRate: 22.5 }]));
  return buildOvertimeReportRows({
    shifts: EMILIO_SHIFTS,
    employees: new Map([["kiosk-admin", { name: "Emilio Peguero", defaultJobId: null, customRate: 15, isSubcontractor: false, subcontractorName: null }]]),
    jobs: new Map([["laborer", { id: "laborer", name: "Laborer", hourlyRate: 15, active: true }]]),
    jobIdByClockInId: new Map(),
    autoBreakByClockInId: new Map(EMILIO_SHIFTS.map((s) => [s.id, { minutes: 0, minShiftHours: 0 }])),
    settings: {
      enabled: true,
      weeklyThresholdHours: 40,
      dailyThresholdHours: 8,
      weekStartsOn: 1,
      multiplier: 1.5,
      roundOvertimeMinutes: 0,
      automaticBreakMinutes: 0,
      minimumShiftHours: 0,
      timeZone: "America/Chicago",
    },
    roundDailyMinutes: 0,
    startDate: "2026-11-23",
    endDate: "2026-11-26",
    frozenOvertimeMinutesByClockInId: new Map(EMILIO_SHIFTS.map((s) => [s.id, 0])),
    frozenRatesByClockInId: frozenRates,
    tipCentsByClockInId: new Map([["852d03f2", 10000], ["ddccba1a", 6700], ["b3805431", 6700]]),
  });
}

test("OT Test Co Emilio: Nov 25 evening shift stays on Nov 25; Nov 26 has $234 tips, $288.00", () => {
  const rows = emilioRows();
  assert.deepEqual(rows.map((r) => r.date), ["2026-11-25", "2026-11-26"]);
  const [nov25, nov26] = rows;
  assert.equal(nov25.clockedMinutes, 1);
  assert.equal(nov25.breakMinutes, 0);
  assert.equal(nov25.workedMinutes, 1);
  assert.equal(nov26.clockedMinutes, 343);
  assert.equal(nov26.breakMinutes, 127);
  assert.equal(nov26.workedMinutes, 216);
  assert.equal(nov26.overtimeMinutes, 0);
  assert.equal(nov26.tips, 234);
  assert.equal(nov26.pay, 288);
});

test("OT Test Co Emilio: Payroll Hours Excel from a fresh run has OT columns, $234 tips, $288.00 / $288.30", () => {
  const rows = emilioRows();
  const opts = payrollExportOptions({
    overtimeRows: rows,
    tipsByEmployeeDay: new Map(),
    computedWith: reportComputedWith(SETTINGS),
  });
  assert.ok(opts.overtime && opts.tips);
  const summary = [
    { employeeId: "kiosk-admin", employeeName: "Emilio Peguero", totalHours: 5.73, totalBreakHours: 2.11, sessionCount: 6, openSessions: 0, hourlyRate: 15, estimatedPay: 0, subcontractorId: null, subcontractorName: null, tips: 234 },
  ];
  const wb = new ExcelJS.Workbook();
  addPayrollSheetWithOvertime(wb, summary, [{ id: "laborer", name: "Laborer", hourlyRate: 15, active: true }], opts.overtime.rows, opts.overtime.multiplier, 0, "OT Test Co", "2026-11-23", "2026-11-26", opts.tips !== null);
  const sheet = wb.getWorksheet("Payroll Hours");
  const header = [...Array(12)].map((_, i) => sheet.getCell(2, i + 1).value);
  assert.deepEqual(header.slice(1, 6), ["Shift Hours", "Break", "Regular Hours", "Overtime", "Total Worked"]);
  assert.equal(header[9], "Tips");
  // Daily rows: 7 = header, 8 = Nov 25, 9 = Nov 26.
  const num = (r, c) => Number(sheet.getCell(r, c).value);
  const rate = 15; // frozen rate (D is IF(C="(Default)",15,...))
  assert.equal(sheet.getCell(8, 2).value, "Nov 25, 2026");
  assert.deepEqual([num(8, 5), num(8, 6), num(8, 8), num(8, 9), num(8, 10)], [0.02, 0, 0, 0.02, 0]);
  assert.equal(sheet.getCell(9, 2).value, "Nov 26, 2026");
  assert.deepEqual([num(9, 5), num(9, 6), num(9, 8), num(9, 9), num(9, 10)], [5.72, 2.12, 0, 3.6, 234]);
  assert.match(String(sheet.getCell(8, 4).value.formula), /^IF\(C8="\(Default\)",15,/);
  // Est. Pay = D x Regular + OT rate x OT + Tips, Regular = Total Worked - OT.
  const pay = (r) => Math.round((rate * (num(r, 9) - num(r, 8)) + 22.5 * num(r, 8) + num(r, 10)) * 100) / 100;
  assert.equal(pay(8), 0.3);
  assert.equal(pay(9), 288);
  assert.equal(Math.round((pay(8) + pay(9)) * 100) / 100, 288.3);
  assert.equal(sheet.getCell(9, 11).value.formula, "D9*G9+N9*H9+J9");
});
