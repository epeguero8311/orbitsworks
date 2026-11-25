// Tips (Task 3) - tips in Reports rows, CSV and Excel (Overtime ON and OFF).
// Plan pass check (D4): Juan Nov 12 = example E ($213) + a $45 tip on the
// Foreman shift -> Laborer $75, Foreman $183, Day total $258.
// Plain Node, no emulator. Run via: node --test test/tipsExport.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const { buildOvertimeReportRows, computeOvertimeTotals, applyOvertimeOverrides } = await import("../lib/reportOvertime.ts");
const { buildDailyBreakdownRows, computeEmployeeRoundedTotals } = await import("../lib/reportDailyBreakdown.ts");
const {
  addPayrollSheet,
  addPayrollSheetWithOvertime,
  addEmployeeHistorySheet,
  addEmployeeHistorySheetWithOvertime,
  buildDayRows,
  colLetter,
} = await import("../lib/payrollExcelSheets.ts");
const { toPayrollCsv, toPayrollCsvWithOvertime } = await import("../lib/reportUtils.ts");

const ct = (day, hour, minute = 0) => Date.UTC(2026, 10, day, hour + 6, minute);
const JOB_LIST = [
  { id: "laborer", name: "Laborer", hourlyRate: 15, active: true },
  { id: "foreman", name: "Foreman", hourlyRate: 23, active: true },
];
const JOBS = new Map(JOB_LIST.map((j) => [j.id, j]));
const EMP = new Map([
  ["juan", { name: "Juan", defaultJobId: "laborer", customRate: null, isSubcontractor: false, subcontractorName: null }],
]);
const SETTINGS = {
  enabled: true,
  weeklyThresholdHours: 40,
  dailyThresholdHours: 8,
  weekStartsOn: 1,
  multiplier: 1.5,
  roundOvertimeMinutes: 0,
  automaticBreakMinutes: 0,
  minimumShiftHours: 0,
  timeZone: "America/Chicago",
};
const SHIFTS = [
  { id: "lab", employeeId: "juan", startMs: ct(12, 7), endMs: ct(12, 12), breakMs: 0 },
  { id: "fore", employeeId: "juan", startMs: ct(12, 12, 30), endMs: ct(12, 17, 30), breakMs: 0 },
];
const TIPS = new Map([["fore", 4500]]);

function juanRows(tipCentsByClockInId = TIPS) {
  return buildOvertimeReportRows({
    shifts: SHIFTS,
    employees: EMP,
    jobs: JOBS,
    jobIdByClockInId: new Map([["fore", "foreman"]]),
    autoBreakByClockInId: new Map(),
    settings: SETTINGS,
    roundDailyMinutes: 0,
    startDate: "2026-11-09",
    endDate: "2026-11-15",
    tipCentsByClockInId,
  });
}
const money = (n) => Math.round(n * 100) / 100;
const SUMMARY = [
  { employeeId: "juan", employeeName: "Juan", totalHours: 10, totalBreakHours: 0, sessionCount: 2, openSessions: 0, hourlyRate: 15, estimatedPay: 0, subcontractorId: null, subcontractorName: null, tips: 45 },
];

test("D4 pass check: tip on the Foreman shift stays on its job row; Day total $258", () => {
  const rows = juanRows();
  assert.deepEqual(
    rows.map((r) => [r.kind, r.jobLabel, r.workedMinutes / 60, r.overtimeMinutes / 60, r.tips, money(r.pay)]),
    [
      ["job", "Laborer", 5, 0, 0, 75],
      ["job", "Foreman", 5, 2, 45, 183],
      ["total", "Day total", 10, 2, 45, 258],
    ]
  );
  const t = computeOvertimeTotals(rows, 0).get("juan");
  assert.equal(t.totalTips, 45);
  assert.equal(money(t.totalPay), 258);
  // No tips (Tips OFF) = exactly example E.
  assert.deepEqual(juanRows(new Map()).map((r) => money(r.pay)), [75, 138, 213]);
});

test("single-job day: tips add into pay and survive a report-only Job override", () => {
  const rows = buildOvertimeReportRows({
    shifts: [{ id: "s", employeeId: "juan", startMs: ct(10, 7), endMs: ct(10, 15), breakMs: 0 }],
    employees: EMP,
    jobs: JOBS,
    jobIdByClockInId: new Map(),
    autoBreakByClockInId: new Map(),
    settings: SETTINGS,
    roundDailyMinutes: 0,
    startDate: "2026-11-09",
    endDate: "2026-11-15",
    tipCentsByClockInId: new Map([["s", 1050]]),
  });
  assert.equal(money(rows[0].pay), 8 * 15 + 10.5);
  const overridden = applyOvertimeOverrides(rows, { [rows[0].key]: "foreman" }, JOB_LIST, 1.5);
  assert.equal(money(overridden[0].pay), 8 * 23 + 10.5);
  assert.equal(overridden[0].tips, 10.5);
});

test("an open shift (no clock-out) carries no tip - tips follow hours", () => {
  const rows = buildOvertimeReportRows({
    shifts: [{ id: "open", employeeId: "juan", startMs: ct(11, 7), endMs: null, breakMs: 0 }],
    employees: EMP,
    jobs: JOBS,
    jobIdByClockInId: new Map(),
    autoBreakByClockInId: new Map(),
    settings: SETTINGS,
    roundDailyMinutes: 0,
    startDate: "2026-11-09",
    endDate: "2026-11-15",
    tipCentsByClockInId: new Map([["open", 999]]),
  });
  assert.ok(rows.every((r) => r.tips === 0));
});

// Reads a Payroll Hours (OT ON) Est. Pay the way Excel would for a plain
// job row: rate x (Worked - OT) + OT rate x OT + Tips.
function cellNum(sheet, r, c) {
  const v = sheet.getCell(r, c).value;
  return typeof v === "number" ? v : 0;
}

test("Payroll Hours Excel (OT ON) + Tips: Tips column before Est. Pay, Est. Pay adds it, Day total sums it", () => {
  const wb = new ExcelJS.Workbook();
  addPayrollSheetWithOvertime(wb, SUMMARY, JOB_LIST, juanRows(), 1.5, 0, "Acme", "2026-11-09", "2026-11-15", true);
  const sheet = wb.getWorksheet("Payroll Hours");
  assert.equal(sheet.getCell(2, 10).value, "Tips");
  assert.equal(sheet.getCell(2, 11).value, "Estimated Pay (Excluding Break)");
  assert.equal(sheet.getCell(2, 12).value, "Company");
  const header = [...Array(15)].map((_, i) => sheet.getCell(7, i + 1).value);
  assert.deepEqual(header.slice(9, 15), ["Tips", "Estimated Pay (Excluding Break)", "Company", "Default Rate", "OT Rate", "Default OT Rate"]);
  assert.ok(sheet.getColumn(13).hidden && sheet.getColumn(14).hidden && sheet.getColumn(15).hidden);
  assert.ok(!sheet.getColumn(12).hidden);

  const lab = 8;
  const fore = 9;
  const total = 10;
  assert.equal(sheet.getCell(lab, 3).value, "Laborer");
  assert.equal(sheet.getCell(fore, 3).value, "Foreman");
  assert.equal(sheet.getCell(total, 3).value, "Day total");
  assert.equal(sheet.getCell(fore, 10).value, 45);
  assert.equal(sheet.getCell(lab, 10).value, 0);
  assert.equal(sheet.getCell(fore, 11).value.formula, `D${fore}*G${fore}+N${fore}*H${fore}+J${fore}`);
  const estPay = (r) =>
    cellNum(sheet, r, 4) * (cellNum(sheet, r, 9) - cellNum(sheet, r, 8)) + cellNum(sheet, r, 14) * cellNum(sheet, r, 8) + cellNum(sheet, r, 10);
  assert.equal(money(estPay(lab)), 75);
  assert.equal(money(estPay(fore)), 183);
  assert.equal(money(estPay(lab) + estPay(fore)), 258);
  assert.equal(sheet.getCell(total, 10).value.formula, `SUM(J${lab}:J${fore})`);
  assert.equal(sheet.getCell(total, 11).value.formula, `SUM(K${lab}:K${fore})`);
  // Summary pulls Tips + Est. Pay from the day rows (Day total skipped).
  assert.match(sheet.getCell(3, 10).value.formula, /^SUMIFS\(J8:J10,/);
  assert.match(sheet.getCell(3, 11).value.formula, /^SUMIFS\(K8:K10,/);
});

test("Payroll Hours Excel (OT ON) with Tips OFF is unchanged", () => {
  const wb = new ExcelJS.Workbook();
  addPayrollSheetWithOvertime(wb, SUMMARY, JOB_LIST, juanRows(new Map()), 1.5, 0, "Acme", "2026-11-09", "2026-11-15");
  const sheet = wb.getWorksheet("Payroll Hours");
  assert.equal(sheet.getCell(2, 10).value, "Estimated Pay (Excluding Break)");
  assert.equal(sheet.getCell(9, 10).value.formula, "D9*G9+M9*H9");
});

test("Payroll Hours Excel (OT OFF) + Tips: H Tips, I Est. Pay = D*G + H, summary SUMIFs", () => {
  const hours = new Map([["juan__2026-11-12", 10]]);
  const dayRows = buildDayRows(SUMMARY, hours, new Map(), new Map([["juan", "laborer"]]), JOB_LIST, 0, new Map(), new Map([["juan__2026-11-12", 45]]));
  assert.equal(dayRows[0].tips, 45);
  const wb = new ExcelJS.Workbook();
  addPayrollSheet(wb, SUMMARY, JOB_LIST, dayRows, 0, "Acme", "2026-11-09", "2026-11-15", true);
  const sheet = wb.getWorksheet("Payroll Hours");
  assert.deepEqual([8, 9, 10].map((c) => sheet.getCell(2, c).value), ["Tips", "Estimated Pay (Excluding Break)", "Company"]);
  const dailyHeader = 7;
  assert.deepEqual([8, 9, 10, 11].map((c) => sheet.getCell(dailyHeader, c).value), ["Tips", "Estimated Pay (Excluding Break)", "Company", "Default Rate"]);
  assert.ok(sheet.getColumn(11).hidden);
  const r = dailyHeader + 1;
  assert.equal(sheet.getCell(r, 8).value, 45);
  assert.equal(sheet.getCell(r, 9).value.formula, `D${r}*G${r}+H${r}`);
  assert.match(sheet.getCell(r, 4).value.formula, new RegExp(`K${r}`));
  assert.equal(sheet.getCell(3, 8).value.formula, `SUMIF(A${r}:A${r},A3,H${r}:H${r})`);
  assert.equal(sheet.getCell(3, 9).value.formula, `SUMIF(A${r}:A${r},A3,I${r}:I${r})`);

  // OFF: the old layout.
  const wb2 = new ExcelJS.Workbook();
  addPayrollSheet(wb2, SUMMARY, JOB_LIST, dayRows, 0, "Acme", "2026-11-09", "2026-11-15");
  const s2 = wb2.getWorksheet("Payroll Hours");
  assert.equal(s2.getCell(2, 8).value, "Estimated Pay (Excluding Break)");
  assert.equal(s2.getCell(r, 8).value.formula, `D${r}*G${r}`);
  assert.ok(s2.getColumn(10).hidden);
});

test("Reports daily rows + CSV (OT OFF): Est. Pay includes tips, Tips column only when ON", () => {
  const hours = new Map([["juan__2026-11-12", 10]]);
  const rows = buildDailyBreakdownRows(SUMMARY, hours, new Map(), JOB_LIST, {}, 0, new Map([["juan__2026-11-12", 45]]));
  assert.equal(rows[0].tips, 45);
  assert.equal(rows[0].pay, 10 * 15 + 45);
  const totals = computeEmployeeRoundedTotals(rows, 0);
  assert.equal(totals.get("juan").totalTips, 45);
  assert.equal(totals.get("juan").totalPay, 195);

  const csvOn = toPayrollCsv(SUMMARY, "2026-11-09", "2026-11-15", rows, totals, true).replaceAll("\"", "").split("\n");
  assert.match(csvOn[1], /Hourly Rate,Tips,Estimated Pay \(Excluding Break\)$/);
  assert.match(csvOn[2], /15\.00,45\.00,195\.00$/);
  const dailyHeaderIdx = csvOn.indexOf("Daily Breakdown") + 1;
  assert.match(csvOn[dailyHeaderIdx], /,Tips,Estimated Pay$/);
  assert.match(csvOn[dailyHeaderIdx + 1], /,45\.00,195\.00$/);
  const csvOff = toPayrollCsv(SUMMARY, "2026-11-09", "2026-11-15", rows, totals).split("\n");
  assert.doesNotMatch(csvOff.join("\n"), /Tips/);
});

test("CSV (OT ON) + Tips: job rows keep their own tip, Day total $258", () => {
  const rows = juanRows();
  const csv = toPayrollCsvWithOvertime(SUMMARY, "2026-11-09", "2026-11-15", rows, computeOvertimeTotals(rows, 0), true).replaceAll("\"", "").split("\n");
  assert.match(csv[1], /,Tips,Estimated Pay \(Excluding Break\)$/);
  assert.match(csv[2], /,45\.00,258\.00$/);
  const d = csv.indexOf("Daily Breakdown") + 1;
  assert.match(csv[d], /,Tips,Estimated Pay$/);
  assert.match(csv[d + 1], /Laborer,.*,0\.00,75\.00$/);
  assert.match(csv[d + 2], /Foreman,.*,45\.00,183\.00$/);
  assert.match(csv[d + 3], /Day total,.*,45\.00,258\.00$/);
});

const HISTORY_ROW = {
  dateLabel: "Nov 12, 2026",
  weekLabel: "Nov 9",
  siteName: "Site",
  clockInLabel: "12:30 PM",
  clockOutLabel: "5:30 PM",
  hours: 5,
  breakHours: 0,
  note: "",
  adjusted: false,
  tips: 45,
};

test("Time History (OT OFF) + Tips: Est. Pay adds tips; the OT premium is worked out from wages only", () => {
  const wb = new ExcelJS.Workbook();
  addEmployeeHistorySheet(wb, "Juan", 15, "laborer", JOB_LIST, [HISTORY_ROW], [{ weekLabel: "Nov 9", hours: 5 }], 40, "2026-11-09", "2026-11-15", true);
  const sheet = wb.getWorksheet("Time History");
  assert.deepEqual([5, 6].map((c) => sheet.getCell(2, c).value), ["Tips", "Estimated Pay (Excluding Break)"]);
  const dailyHeader = 6;
  assert.deepEqual([10, 11, 12, 13].map((c) => sheet.getCell(dailyHeader, c).value), ["Tips", "Estimated Pay (Excluding Break)", "Notes", "Adjusted"]);
  const r = dailyHeader + 1;
  assert.equal(sheet.getCell(r, 10).value, 45);
  assert.equal(sheet.getCell(r, 11).value.formula, `D${r}*I${r}+J${r}`);
  assert.equal(sheet.getCell(r, 15).value, "Nov 9"); // Week Of helper moved to O
  assert.ok(sheet.getColumn(14).hidden && sheet.getColumn(15).hidden);
  assert.equal(sheet.getCell(3, 5).value.formula, `SUMIF(O${r}:O${r},A3,J${r}:J${r})`);
  const wages = `(SUMIF(O${r}:O${r},A3,K${r}:K${r})-E3)`;
  assert.equal(sheet.getCell(3, 6).value.formula, `${wages}+IF(C3=0,0,(${wages}/C3)*D3*0.5)+E3`);

  const wb2 = new ExcelJS.Workbook();
  addEmployeeHistorySheet(wb2, "Juan", 15, "laborer", JOB_LIST, [HISTORY_ROW], [{ weekLabel: "Nov 9", hours: 5 }], 40, "2026-11-09", "2026-11-15");
  const s2 = wb2.getWorksheet("Time History");
  assert.equal(s2.getCell(2, 5).value, "Estimated Pay (Excluding Break)");
  assert.equal(s2.getCell(r, 10).value.formula, `D${r}*I${r}`);
  assert.equal(s2.getCell(r, 14).value, "Nov 9");
});

test("Time History (OT ON) + Tips: L Tips, M Est. Pay = D*I + Q*J + L (hidden helpers shifted)", () => {
  const wb = new ExcelJS.Workbook();
  const row = { ...HISTORY_ROW, jobId: "foreman", jobName: "Foreman", rate: 23, overtimeHours: 2, overtimeRate: 34.5 };
  addEmployeeHistorySheetWithOvertime(wb, "Juan", 15, 22.5, false, JOB_LIST, 1.5, [row], ["Nov 9"], "2026-11-09", "2026-11-15", true);
  const sheet = wb.getWorksheet("Time History");
  assert.deepEqual([7, 8].map((c) => sheet.getCell(2, c).value), ["Tips", "Estimated Pay (Excluding Break)"]);
  const dailyHeader = 6;
  const r = dailyHeader + 1;
  assert.equal(sheet.getCell(dailyHeader, 12).value, "Tips");
  assert.equal(sheet.getCell(r, 12).value, 45);
  assert.equal(sheet.getCell(r, 13).value.formula, `D${r}*I${r}+R${r}*J${r}+L${r}`);
  assert.equal(sheet.getCell(r, 17).value, "Nov 9");
  for (const c of [16, 17, 18, 19]) assert.ok(sheet.getColumn(c).hidden, `col ${c} hidden`);
  assert.equal(sheet.getCell(3, 8).value.formula, `SUMIF(Q${r}:Q${r},A3,M${r}:M${r})`);
});

test("colLetter", () => {
  assert.deepEqual([1, 10, 26, 27, 52].map(colLetter), ["A", "J", "Z", "AA", "AZ"]);
});

test("Overtime OFF tally: a tip counts only with its session's hours (pending = not in the gated events)", async () => {
  const { computePayrollAndSessions } = await import("../lib/reportComputations.ts");
  const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
  const ev = (id, type, ms) => ({ id, employeeId: "juan", employeeName: "Juan", siteId: null, siteName: "", type, timestamp: ts(ms) });
  // "approved" session only - the pending one was already filtered out
  // (computeExcludedEventIds), so its tip never reaches the tally.
  const events = [ev("in1", "in", ct(12, 7)), ev("out1", "out", ct(12, 17))];
  const result = computePayrollAndSessions(
    events,
    new Map(),
    new Map([["juan", 15]]),
    0,
    0,
    new Map(),
    new Map([["in1", 4500], ["pendingIn", 9900]])
  );
  assert.equal(result.summaries[0].tips, 45);
  assert.equal(result.summaries[0].estimatedPay, 10 * 15 + 45);
  assert.deepEqual([...result.tipsByEmployeeDay.values()], [45]);
});
