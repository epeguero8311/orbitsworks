// Overtime (Task 1) step 5 - Payroll Hours + Time History Excel sheets with
// Overtime ON (lib/payrollExcelSheets.ts *WithOvertime). Builds a real
// exceljs workbook in memory and checks cells/formulas. Plain Node.
// Run via: node --test test/payrollOvertimeExcel.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const { addPayrollSheetWithOvertime, addEmployeeHistorySheetWithOvertime, PAYROLL_DAY_TOTAL_LABEL } = await import(
  "../lib/payrollExcelSheets.ts"
);
const { buildOvertimeReportRows } = await import("../lib/reportOvertime.ts");

const ct = (day, hour, minute = 0) => Date.UTC(2026, 10, day, hour + 6, minute);
const JOB_LIST = [
  { id: "laborer", name: "Laborer", hourlyRate: 15, active: true },
  { id: "foreman", name: "Foreman", hourlyRate: 23, active: true, overtimeRate: 40 },
  { id: "old", name: "Old Title", hourlyRate: 20, active: false },
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

function rows() {
  return buildOvertimeReportRows({
    shifts: [
      { id: "a", employeeId: "juan", startMs: ct(10, 7), endMs: ct(10, 17), breakMs: 0 }, // single, 2 OT
      { id: "b", employeeId: "juan", startMs: ct(12, 7), endMs: ct(12, 12), breakMs: 0 },
      { id: "c", employeeId: "juan", startMs: ct(12, 12, 30), endMs: ct(12, 17, 30), breakMs: 0 },
      { id: "d", employeeId: "juan", startMs: ct(13, 7), endMs: ct(13, 9), breakMs: 0 }, // inactive job
    ],
    employees: EMP,
    jobs: JOBS,
    jobIdByClockInId: new Map([["c", "foreman"], ["d", "old"]]),
    autoBreakByClockInId: new Map(),
    settings: SETTINGS,
    roundDailyMinutes: 0,
    startDate: "2026-11-09",
    endDate: "2026-11-15",
  });
}

const SUMMARY = [
  { employeeId: "juan", employeeName: "Juan", totalHours: 22, totalBreakHours: 0, sessionCount: 4, openSessions: 0, hourlyRate: 15, estimatedPay: 0, subcontractorId: null, subcontractorName: null },
];

function findRow(sheet, predicate) {
  for (let r = 1; r <= sheet.rowCount; r++) if (predicate(sheet.getRow(r), r)) return r;
  return -1;
}

test("Payroll Hours (OT ON): headers, OT column, single-day dropdown, locked split rows, day total", async () => {
  const wb = new ExcelJS.Workbook();
  addPayrollSheetWithOvertime(wb, SUMMARY, JOB_LIST, rows(), 1.5, 0, "Acme", "2026-11-09", "2026-11-15");
  const sheet = wb.getWorksheet("Payroll Hours");
  const jobsSheet = wb.getWorksheet("Jobs");

  // Jobs lookup gets the OT rate column (fixed, else rate x multiplier).
  assert.deepEqual([2, 3].map((r) => [jobsSheet.getCell(r, 1).value, jobsSheet.getCell(r, 3).value]), [
    ["Laborer", 22.5],
    ["Foreman", 40],
  ]);

  assert.equal(sheet.getCell(2, 5).value, "Overtime");
  const dailyHeader = findRow(sheet, (row) => row.getCell(1).value === "Employee" && row.getCell(2).value === "Date");
  assert.equal(sheet.getCell(dailyHeader, 7).value, "Worked Hours");
  assert.equal(sheet.getCell(dailyHeader, 8).value, "Overtime");

  // Single-job day (Nov 10): live dropdown, OT rate follows the job.
  const single = dailyHeader + 1;
  assert.equal(sheet.getCell(single, 3).value, "Laborer");
  assert.deepEqual(sheet.getCell(single, 3).dataValidation.formulae, ["JobsList"]);
  assert.equal(sheet.getCell(single, 8).value, 2);
  assert.match(sheet.getCell(single, 12).value.formula, /VLOOKUP\(C\d+,JobsTable,3,FALSE\)/);
  assert.equal(sheet.getCell(single, 9).value.formula, `D${single}*(G${single}-H${single})+L${single}*H${single}`);

  // 2-job day (Nov 12): locked job rows with plain values + Day total.
  const lab = single + 1;
  assert.equal(sheet.getCell(lab, 3).value, "Laborer");
  assert.equal(sheet.getCell(lab, 3).dataValidation?.formulae, undefined);
  assert.equal(sheet.getCell(lab + 1, 3).value, "Foreman");
  assert.equal(sheet.getCell(lab + 1, 4).value, 23);
  assert.equal(sheet.getCell(lab + 1, 12).value, 40);
  assert.equal(sheet.getCell(lab + 1, 8).value, 2);
  const total = lab + 2;
  assert.equal(sheet.getCell(total, 3).value, PAYROLL_DAY_TOTAL_LABEL);
  assert.equal(sheet.getCell(total, 7).value.formula, `SUM(G${lab}:G${lab + 1})`);
  assert.equal(sheet.getCell(total, 9).value.formula, `SUM(I${lab}:I${lab + 1})`);

  // Inactive job on a single-job day: locked (can't be in the dropdown list).
  const inactive = total + 1;
  assert.equal(sheet.getCell(inactive, 3).value, "Old Title");
  assert.equal(sheet.getCell(inactive, 3).dataValidation?.formulae, undefined);
  assert.equal(sheet.getCell(inactive, 4).value, 20);

  // Summary skips Day total rows so nothing counts twice.
  assert.match(sheet.getCell(3, 5).value.formula, /^SUMIFS\(H\d+:H\d+,A\d+:A\d+,A3,C\d+:C\d+,"<>Day total"\)$/);
  assert.match(sheet.getCell(3, 9).value.formula, /^SUMIFS\(I/);

  // Writes a valid file.
  const buf = await wb.xlsx.writeBuffer();
  assert.ok(buf.byteLength > 1000);
});

test("Time History (OT ON): Overtime column, OT-aware pay formula, weekly OT sums", async () => {
  const wb = new ExcelJS.Workbook();
  const base = { dateLabel: "Nov 10, 2026", weekLabel: "Nov 9", siteName: "Main", clockInLabel: "7:00 AM", clockOutLabel: "5:00 PM", hours: 10, breakHours: 0, note: "", adjusted: false };
  addEmployeeHistorySheetWithOvertime(
    wb,
    "Juan",
    15,
    22.5,
    false,
    JOB_LIST,
    1.5,
    [{ ...base, jobId: "laborer", jobName: "Laborer", rate: 15, overtimeHours: 2, overtimeRate: 22.5 }],
    ["Nov 9"],
    "2026-11-09",
    "2026-11-15"
  );
  const sheet = wb.getWorksheet("Time History");
  assert.equal(sheet.getCell(2, 4).value, "Overtime Hours");
  assert.match(sheet.getCell(3, 4).value.formula, /^SUMIF\(O\d+:O\d+,A3,J\d+:J\d+\)$/);
  const header = findRow(sheet, (row) => row.getCell(1).value === "Date" && row.getCell(2).value === "Job Site");
  assert.equal(sheet.getCell(header, 10).value, "Overtime");
  const r = header + 1;
  assert.equal(sheet.getCell(r, 10).value, 2);
  assert.equal(sheet.getCell(r, 11).value.formula, `D${r}*(I${r}-J${r})+P${r}*J${r}`);
  assert.match(sheet.getCell(r, 16).value.formula, /VLOOKUP\(C\d+,JobsTable,3,FALSE\)/);
  const buf = await wb.xlsx.writeBuffer();
  assert.ok(buf.byteLength > 1000);
});
