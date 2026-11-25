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

  // Hours columns (Nov 25): Shift | Break | Regular | Overtime | Total Worked, with notes.
  assert.deepEqual([2, 3, 4, 5, 6].map((c) => sheet.getCell(2, c).value), ["Shift Hours", "Break", "Regular Hours", "Overtime", "Total Worked"]);
  assert.equal(sheet.getCell(2, 4).note, "Hours up to the OT threshold");
  assert.equal(sheet.getCell(2, 9).value, "Hourly Rate");
  assert.equal(sheet.getCell(3, 9).value, "Mixed"); // Juan worked Laborer + Foreman + Old Title
  assert.equal(sheet.getCell(3, 4).value.formula, "F3-E3"); // Regular = Total Worked - Overtime, live
  assert.ok(sheet.getColumn(10).width >= 32); // "Estimated Pay (Excluding Break)" fits
  const dailyHeader = findRow(sheet, (row) => row.getCell(1).value === "Employee" && row.getCell(2).value === "Date");
  assert.deepEqual([5, 6, 7, 8, 9].map((c) => sheet.getCell(dailyHeader, c).value), ["Shift Hours", "Break", "Regular Hours", "Overtime", "Total Worked"]);
  assert.equal(sheet.getCell(dailyHeader, 5).note, "Total shift duration");
  assert.equal(sheet.getCell(dailyHeader, 9).note, "Regular + OT");

  // Single-job day (Nov 10): live dropdown, OT rate follows the job.
  const single = dailyHeader + 1;
  assert.equal(sheet.getCell(single, 3).value, "Laborer");
  assert.deepEqual(sheet.getCell(single, 3).dataValidation.formulae, ["JobsList"]);
  assert.equal(sheet.getCell(single, 8).value, 2);
  assert.equal(sheet.getCell(single, 9).value, 10);
  assert.equal(sheet.getCell(single, 7).value.formula, `I${single}-H${single}`);
  assert.match(sheet.getCell(single, 13).value.formula, /VLOOKUP\(C\d+,JobsTable,3,FALSE\)/);
  assert.equal(sheet.getCell(single, 10).value.formula, `D${single}*G${single}+M${single}*H${single}`);

  // 2-job day (Nov 12): locked job rows with plain values + Day total.
  const lab = single + 1;
  assert.equal(sheet.getCell(lab, 3).value, "Laborer");
  assert.equal(sheet.getCell(lab, 3).dataValidation?.formulae, undefined);
  assert.equal(sheet.getCell(lab + 1, 3).value, "Foreman");
  assert.equal(sheet.getCell(lab + 1, 4).value, 23);
  assert.equal(sheet.getCell(lab + 1, 13).value, 40);
  assert.equal(sheet.getCell(lab + 1, 8).value, 2);
  const total = lab + 2;
  assert.equal(sheet.getCell(total, 3).value, PAYROLL_DAY_TOTAL_LABEL);
  assert.equal(sheet.getCell(total, 7).value.formula, `I${total}-H${total}`); // Regular live on the total too
  assert.equal(sheet.getCell(total, 9).value.formula, `SUM(I${lab}:I${lab + 1})`);
  assert.equal(sheet.getCell(total, 10).value.formula, `SUM(J${lab}:J${lab + 1})`);

  // Inactive job on a single-job day: locked (can't be in the dropdown list).
  const inactive = total + 1;
  assert.equal(sheet.getCell(inactive, 3).value, "Old Title");
  assert.equal(sheet.getCell(inactive, 3).dataValidation?.formulae, undefined);
  assert.equal(sheet.getCell(inactive, 4).value, 20);

  // Summary skips Day total rows so nothing counts twice.
  assert.match(sheet.getCell(3, 5).value.formula, /^SUMIFS\(H\d+:H\d+,A\d+:A\d+,A3,C\d+:C\d+,"<>Day total"\)$/);
  assert.match(sheet.getCell(3, 6).value.formula, /^SUMIFS\(I/);
  assert.match(sheet.getCell(3, 10).value.formula, /^SUMIFS\(J/);

  // Day total rows are exempt from Excel's "inconsistent formula" warning.
  const { applyIgnoredErrors, ignoredFormulaErrorsOf } = await import("../lib/xlsxIgnoredErrors.ts");
  assert.deepEqual(ignoredFormulaErrorsOf(wb), [{ sheetName: "Payroll Hours", sqref: `A${total}:N${total}` }]);
  const JSZip = (await import("jszip")).default;
  const out = await applyIgnoredErrors(await wb.xlsx.writeBuffer(), ignoredFormulaErrorsOf(wb));
  const zip = await JSZip.loadAsync(out);
  const names = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const xmls = await Promise.all(names.map((n) => zip.file(n).async("string")));
  const payrollXml = xmls.find((x) => x.includes("<ignoredErrors"));
  assert.ok(payrollXml, "ignoredErrors written");
  assert.match(payrollXml, new RegExp(`<ignoredError sqref="A${total}:N${total}" formula="1" formulaRange="1"/>`));
  // Schema order: ignoredErrors before legacyDrawing (the header notes).
  assert.ok(payrollXml.indexOf("<ignoredErrors") < payrollXml.indexOf("<legacyDrawing"));
  // Round-trips: exceljs can still read the file.
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(out);
  assert.equal(back.getWorksheet("Payroll Hours").getCell(total, 3).value, PAYROLL_DAY_TOTAL_LABEL);

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
  assert.deepEqual([2, 3, 4, 5, 6].map((c) => sheet.getCell(2, c).value), ["Shift Hours", "Break", "Regular Hours", "Overtime", "Total Worked"]);
  assert.match(sheet.getCell(3, 5).value.formula, /^SUMIF\(P\d+:P\d+,A3,J\d+:J\d+\)$/);
  assert.equal(sheet.getCell(3, 4).value.formula, "F3-E3");
  const header = findRow(sheet, (row) => row.getCell(1).value === "Date" && row.getCell(2).value === "Job Site");
  assert.deepEqual([7, 8, 9, 10, 11].map((c) => sheet.getCell(header, c).value), ["Shift Hours", "Break", "Regular Hours", "Overtime", "Total Worked"]);
  assert.equal(sheet.getCell(header, 10).note, "Hours over the OT threshold");
  const r = header + 1;
  assert.equal(sheet.getCell(r, 10).value, 2);
  assert.equal(sheet.getCell(r, 9).value.formula, `K${r}-J${r}`);
  assert.equal(sheet.getCell(r, 11).value.formula, `G${r}-H${r}`);
  assert.equal(sheet.getCell(r, 12).value.formula, `D${r}*I${r}+Q${r}*J${r}`);
  assert.match(sheet.getCell(r, 17).value.formula, /VLOOKUP\(C\d+,JobsTable,3,FALSE\)/);
  const buf = await wb.xlsx.writeBuffer();
  assert.ok(buf.byteLength > 1000);
});

test("decision 4B: a frozen single-job day keeps its dropdown; frozen rate applies while its job is picked", async () => {
  const frozenRows = buildOvertimeReportRows({
    shifts: [{ id: "a", employeeId: "juan", startMs: ct(10, 7), endMs: ct(10, 17), breakMs: 0 }],
    employees: EMP,
    jobs: JOBS,
    jobIdByClockInId: new Map(),
    autoBreakByClockInId: new Map(),
    settings: SETTINGS,
    roundDailyMinutes: 0,
    startDate: "2026-11-09",
    endDate: "2026-11-15",
    frozenRatesByClockInId: new Map([["a", { rate: 14, overtimeRate: 21 }]]),
  });
  const wb = new ExcelJS.Workbook();
  addPayrollSheetWithOvertime(wb, SUMMARY, JOB_LIST, frozenRows, 1.5, 0, "Acme", "2026-11-09", "2026-11-15");
  const sheet = wb.getWorksheet("Payroll Hours");
  const header = findRow(sheet, (row) => row.getCell(1).value === "Employee" && row.getCell(2).value === "Date");
  const r = header + 1;
  assert.deepEqual(sheet.getCell(r, 3).dataValidation.formulae, ["JobsList"]);
  assert.match(sheet.getCell(r, 4).value.formula, /^IF\(C\d+="Laborer",14,IF\(OR/);
  assert.match(sheet.getCell(r, 13).value.formula, /^IF\(C\d+="Laborer",21,IF\(OR/);
});

test("Overtime OFF Excel: same layout as before, only the hours labels changed (+ notes, wider pay column)", async () => {
  const { addPayrollSheet, buildDayRows } = await import("../lib/payrollExcelSheets.ts");
  const summaries = [{ employeeId: "juan", employeeName: "Juan", totalHours: 10, totalBreakHours: 0.5, sessionCount: 1, openSessions: 0, hourlyRate: 15, estimatedPay: 142.5, subcontractorId: null, subcontractorName: null }];
  const dayRows = buildDayRows(summaries, new Map([["juan__2026-11-10", 10]]), new Map([["juan__2026-11-10", 0.5]]), new Map([["juan", "laborer"]]), JOB_LIST, 0);
  const wb = new ExcelJS.Workbook();
  addPayrollSheet(wb, summaries, JOB_LIST, dayRows, 0, "Acme", "2026-11-09", "2026-11-15");
  const sheet = wb.getWorksheet("Payroll Hours");
  assert.deepEqual([1, 2, 3, 4, 5].map((c) => sheet.getCell(2, c).value), ["Employee", "Shift Hours", "Break", "Total Worked", "Sessions"]);
  assert.ok(sheet.getColumn(8).width >= 32);
  const header = findRow(sheet, (row) => row.getCell(1).value === "Employee" && row.getCell(2).value === "Date");
  assert.deepEqual([5, 6, 7, 8].map((c) => sheet.getCell(header, c).value), ["Shift Hours", "Break", "Total Worked", "Estimated Pay (Excluding Break)"]);
  const r = header + 1;
  assert.equal(sheet.getCell(r, 7).value, 9.5); // same number as before
  assert.equal(sheet.getCell(r, 8).value.formula, `D${r}*G${r}`); // same formula as before
  assert.equal(sheet.getCell(2, 3).note, "Unpaid break");
  assert.deepEqual((await import("../lib/xlsxIgnoredErrors.ts")).ignoredFormulaErrorsOf(wb), []);
});
