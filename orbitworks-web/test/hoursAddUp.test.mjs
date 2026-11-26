// Every report row and summary adds up on paper (Nov 26):
//   Shift Hours - Break = Total Worked, Regular + Overtime = Total Worked
// Overtime ON and OFF, Reports page rows/totals, Payroll CSV and Payroll
// Hours Excel. Daily/total rounding OFF (with rounding ON, Total Worked is
// rounded UP on purpose and is more than Shift - Break).
// Plain Node, no emulator. Run via: node --test test/hoursAddUp.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const { hoursDisplay, sumHoursDisplay } = await import("../lib/hoursDisplay.ts");
const { buildOvertimeReportRows, computeOvertimeTotals } = await import("../lib/reportOvertime.ts");
const { computePayrollAndSessions } = await import("../lib/reportComputations.ts");
const { buildDailyBreakdownRows, computeEmployeeRoundedTotals } = await import("../lib/reportDailyBreakdown.ts");
const { buildDayRows, addPayrollSheet, addPayrollSheetWithOvertime } = await import("../lib/payrollExcelSheets.ts");
const { toPayrollCsv, toPayrollCsvWithOvertime } = await import("../lib/reportUtils.ts");

const r2 = (n) => Math.round(n * 100) / 100;
const addsUp = (h, what) => {
  assert.equal(r2(h.shift - h.brk), h.worked, `${what}: ${h.shift} - ${h.brk} != ${h.worked}`);
  assert.equal(r2(h.regular + h.overtime), h.worked, `${what}: ${h.regular} + ${h.overtime} != ${h.worked}`);
};

// Deterministic random shifts: 3 employees, Nov 23-27, 1-3 shifts a day,
// odd seconds, breaks, one 2-job employee, evening shifts.
function randomShifts(seed) {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const shifts = [];
  for (const emp of ["ana", "ben", "cal"]) {
    for (let day = 23; day <= 27; day++) {
      let t = Date.UTC(2026, 10, day, 12) + Math.floor(rnd() * 3600_000);
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const len = 60_000 + Math.floor(rnd() * 5 * 3600_000);
        const brk = rnd() < 0.5 ? Math.floor(rnd() * len * 0.6) : 0;
        shifts.push({ id: `${emp}-${day}-${i}`, employeeId: emp, startMs: t, endMs: t + len, breakMs: brk });
        t += len + Math.floor(rnd() * 2 * 3600_000);
      }
    }
  }
  return shifts;
}

const JOBS = new Map([
  ["laborer", { id: "laborer", name: "Laborer", hourlyRate: 15, active: true }],
  ["foreman", { id: "foreman", name: "Foreman", hourlyRate: 23, active: true }],
]);
const EMPLOYEES = new Map(
  ["ana", "ben", "cal"].map((id) => [id, { name: id, defaultJobId: "laborer", customRate: null, isSubcontractor: false, subcontractorName: null }])
);
const OT_SETTINGS = {
  enabled: true,
  weeklyThresholdHours: 10,
  dailyThresholdHours: 3,
  weekStartsOn: 1,
  multiplier: 1.5,
  roundOvertimeMinutes: 0,
  automaticBreakMinutes: 0,
  minimumShiftHours: 0,
  timeZone: "America/Chicago",
};

function otRows(shifts, autoBreak = 0) {
  return buildOvertimeReportRows({
    shifts,
    employees: EMPLOYEES,
    jobs: JOBS,
    // ben's second shift each day is Foreman -> 2-job days with Day total rows.
    jobIdByClockInId: new Map(shifts.filter((s) => s.employeeId === "ben" && s.id.endsWith("-1")).map((s) => [s.id, "foreman"])),
    autoBreakByClockInId: new Map(),
    settings: { ...OT_SETTINGS, automaticBreakMinutes: autoBreak, minimumShiftHours: autoBreak ? 1 : 0 },
    roundDailyMinutes: 0,
    startDate: "2026-11-23",
    endDate: "2026-11-27",
  });
}

function offData(shifts) {
  const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
  const events = [];
  for (const s of shifts) {
    const ev = (id, type, ms) => ({ id, employeeId: s.employeeId, employeeName: s.employeeId, siteId: null, siteName: "", type, timestamp: ts(ms) });
    events.push(ev(s.id, "in", s.startMs));
    if (s.breakMs > 0) {
      events.push(ev(`${s.id}-bs`, "breakStart", s.startMs + 1000));
      events.push(ev(`${s.id}-be`, "breakEnd", s.startMs + 1000 + s.breakMs));
    }
    events.push(ev(`${s.id}-out`, "out", s.endMs));
  }
  events.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
  return computePayrollAndSessions(events, new Map(), new Map([["ana", 15], ["ben", 15], ["cal", 15]]), 0, 0, new Map(), new Map(), "America/Chicago");
}

test("hoursDisplay: the 0.01 case adds up (10 min shift, 5 min break)", () => {
  assert.deepEqual(hoursDisplay(10, 5, 5), { shift: 0.17, brk: 0.09, regular: 0.08, overtime: 0, worked: 0.08 });
  // Break longer than the shift: worked 0, break shown = shift.
  assert.deepEqual(hoursDisplay(10, 15, 0), { shift: 0.17, brk: 0.17, regular: 0, overtime: 0, worked: 0 });
  // Daily rounding extra (worked > shift - break): break shows its own minutes.
  assert.deepEqual(hoursDisplay(50, 5, 60), { shift: 0.83, brk: 0.08, regular: 1, overtime: 0, worked: 1 });
  // OT split.
  assert.deepEqual(hoursDisplay(545, 30, 515, 35), { shift: 9.08, brk: 0.5, regular: 8, overtime: 0.58, worked: 8.58 });
  addsUp(sumHoursDisplay([hoursDisplay(10, 5, 5), hoursDisplay(545, 30, 515, 35)]), "sum");
});

test("Overtime ON: every row, Day total and summary adds up (200 random weeks, with and without Automatic Break)", () => {
  let dayTotals = 0;
  let overtimeRows = 0;
  for (let seed = 1; seed <= 200; seed++) {
    for (const autoBreak of [0, 30]) {
      const rows = otRows(randomShifts(seed), autoBreak);
      dayTotals += rows.filter((r) => r.kind === "total").length;
      overtimeRows += rows.filter((r) => r.overtimeMinutes > 0).length;
      for (const r of rows) addsUp(r.hours, `seed ${seed} ${r.key}`);
      for (const [id, t] of computeOvertimeTotals(rows, 0)) addsUp(t.hours, `seed ${seed} total ${id}`);
    }
  }
  // The random weeks really cover 2-job days (Day total rows) and OT.
  assert.ok(dayTotals > 100, `${dayTotals} Day total rows`);
  assert.ok(overtimeRows > 100, `${overtimeRows} rows with OT`);
});

test("Overtime OFF: every row and summary adds up (200 random weeks)", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const p = offData(randomShifts(seed));
    const screen = buildDailyBreakdownRows(p.summaries, p.hoursByEmployeeDay, p.breakHoursByEmployeeDay, [], {}, 0, p.tipsByEmployeeDay);
    for (const r of screen) addsUp(r.hours, `seed ${seed} ${r.key}`);
    for (const [id, t] of computeEmployeeRoundedTotals(screen, 0)) addsUp(t.hours, `seed ${seed} total ${id}`);
    const excel = buildDayRows(p.summaries, p.hoursByEmployeeDay, p.breakHoursByEmployeeDay, new Map(), [], 0);
    for (const d of excel) assert.equal(r2(d.hours - d.breakHours), d.workedHours, `seed ${seed} excel ${d.employeeName} ${d.dateKey}`);
    // Screen and Excel show the same numbers.
    assert.deepEqual(
      excel.map((d) => [d.dateKey, d.hours, d.breakHours, d.workedHours]),
      screen.map((r) => [r.date, r.hours.shift, r.hours.brk, r.hours.worked])
    );
  }
});

const cell = (sheet, r, c) => {
  const v = sheet.getCell(r, c).value;
  return typeof v === "number" ? v : null;
};

test("Payroll Hours Excel (Overtime ON): Shift - Break = Total Worked on every day row; summary SUMIFS add up", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rows = otRows(randomShifts(seed));
    const p = offData(randomShifts(seed));
    const wb = new ExcelJS.Workbook();
    addPayrollSheetWithOvertime(wb, p.summaries, [...JOBS.values()], rows, 1.5, 0, "Acme", "2026-11-23", "2026-11-27", false);
    const sheet = wb.getWorksheet("Payroll Hours");
    const byEmp = new Map();
    let checked = 0;
    sheet.eachRow((row, r) => {
      const label = sheet.getCell(r, 3).value;
      if (r < 7 || typeof row.getCell(1).value !== "string" || label === "Day total") return;
      const [shift, brk, ot, worked] = [cell(sheet, r, 5), cell(sheet, r, 6), cell(sheet, r, 8), cell(sheet, r, 9)];
      if (shift === null) return;
      assert.equal(r2(shift - brk), worked, `seed ${seed} row ${r}`);
      assert.ok(ot <= worked);
      const a = byEmp.get(row.getCell(1).value) ?? { shift: 0, brk: 0, worked: 0 };
      byEmp.set(row.getCell(1).value, { shift: a.shift + shift, brk: a.brk + brk, worked: a.worked + worked });
      checked++;
    });
    assert.ok(checked > 0);
    // What the summary SUMIFS add up to (Day total rows skipped).
    for (const [emp, a] of byEmp) assert.equal(r2(a.shift - a.brk), r2(a.worked), `seed ${seed} summary ${emp}`);
  }
});

test("Payroll Hours Excel (Overtime OFF): Shift - Break = Total Worked on every day row; summary Shift is SUMIF of the rows", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const p = offData(randomShifts(seed));
    const dayRows = buildDayRows(p.summaries, p.hoursByEmployeeDay, p.breakHoursByEmployeeDay, new Map(), [], 0);
    const wb = new ExcelJS.Workbook();
    addPayrollSheet(wb, p.summaries, [], dayRows, 0, "Acme", "2026-11-23", "2026-11-27", false);
    const sheet = wb.getWorksheet("Payroll Hours");
    assert.match(String(sheet.getCell(3, 2).value.formula), /^SUMIF\(A\d+:A\d+,A3,E\d+:E\d+\)$/);
    let checked = 0;
    sheet.eachRow((row, r) => {
      if (r <= 7 || typeof row.getCell(1).value !== "string") return;
      const [shift, brk, worked] = [cell(sheet, r, 5), cell(sheet, r, 6), cell(sheet, r, 7)];
      if (shift === null) return;
      assert.equal(r2(shift - brk), worked, `seed ${seed} row ${r}`);
      checked++;
    });
    assert.ok(checked > 0);
  }
});

test("Payroll CSV (OFF and ON): every daily row and summary row adds up", () => {
  const num = (s) => Number(s);
  const p = offData(randomShifts(7));
  const daily = buildDailyBreakdownRows(p.summaries, p.hoursByEmployeeDay, p.breakHoursByEmployeeDay, [], {}, 0);
  const off = toPayrollCsv(p.summaries, "2026-11-23", "2026-11-27", daily, computeEmployeeRoundedTotals(daily, 0)).split("\n");
  const offDaily = off.slice(off.indexOf("Daily Breakdown") + 2).map((l) => l.replace(/^"|"$/g, "").split('","'));
  for (const c of offDaily) assert.equal(r2(num(c[4]) - num(c[5])), num(c[6]), c.join(","));

  const rows = otRows(randomShifts(7));
  const on = toPayrollCsvWithOvertime(p.summaries, "2026-11-23", "2026-11-27", rows, computeOvertimeTotals(rows, 0)).split("\n");
  const onSummary = on.slice(2, 2 + p.summaries.length).map((l) => l.replace(/^"|"$/g, "").split('","'));
  for (const c of onSummary) {
    assert.equal(r2(num(c[1]) - num(c[3])), num(c[6]), c.join(","));
    assert.equal(r2(num(c[4]) + num(c[5])), num(c[6]), c.join(","));
  }
  const onDaily = on.slice(on.indexOf("Daily Breakdown") + 2).map((l) => l.replace(/^"|"$/g, "").split('","'));
  for (const c of onDaily) {
    assert.equal(r2(num(c[4]) - num(c[5])), num(c[8]), c.join(","));
    assert.equal(r2(num(c[6]) + num(c[7])), num(c[8]), c.join(","));
  }
});
