// Hours columns (Task 1, Nov 25): Payroll CSV labels/order, Regular Hours,
// "Mixed" Hourly Rate. Run via: node --test test/payrollCsvColumns.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { toPayrollCsv, toPayrollCsvWithOvertime } = await import("../lib/reportUtils.ts");
const { buildOvertimeReportRows, computeOvertimeTotals } = await import("../lib/reportOvertime.ts");

const parse = (csv) => csv.split("\n").map((line) => line.replace(/^"|"$/g, "").split('","'));
const SUMMARY = [{ employeeId: "juan", employeeName: "Juan", totalHours: 10, totalBreakHours: 0, sessionCount: 2, openSessions: 0, hourlyRate: 15, estimatedPay: 150, subcontractorId: null, subcontractorName: null }];

test("Overtime OFF CSV: same numbers, new labels only", () => {
  const daily = [{ key: "juan__2026-11-10", employeeId: "juan", employeeName: "Juan", date: "2026-11-10", overrideJobId: "", jobLabel: "Default", rate: 15, clockedMinutes: 600, breakMinutes: 0, workedMinutes: 600, hours: { shift: 10, brk: 0, regular: 10, overtime: 0, worked: 10 }, pay: 150 }];
  const lines = toPayrollCsv(SUMMARY, "2026-11-09", "2026-11-15", daily, new Map()).split("\n");
  assert.equal(lines[1], "Employee,Shift Hours (decimal),Shift Hours (h:m),Break (decimal),Completed Sessions,Missing Clock-Outs,Hourly Rate,Estimated Pay (Excluding Break)");
  assert.equal(lines[5], "Employee,Date,Job,Hourly Rate,Shift Hours,Break,Total Worked,Estimated Pay");
  assert.ok(lines[6].includes('"10.00","0.00","10.00","150.00"'));
});

test("Overtime ON CSV: Shift | Break | Regular | Overtime | Total Worked, Regular + OT = Total, Mixed rate", () => {
  const ct = (day, hour, minute = 0) => Date.UTC(2026, 10, day, hour + 6, minute);
  const rows = buildOvertimeReportRows({
    shifts: [
      { id: "a", employeeId: "juan", startMs: ct(10, 7), endMs: ct(10, 12), breakMs: 0 },
      { id: "b", employeeId: "juan", startMs: ct(10, 12, 30), endMs: ct(10, 17, 30), breakMs: 0 },
    ],
    employees: new Map([["juan", { name: "Juan", defaultJobId: "laborer", customRate: null, isSubcontractor: false, subcontractorName: null }]]),
    jobs: new Map([
      ["laborer", { id: "laborer", name: "Laborer", hourlyRate: 15, active: true }],
      ["foreman", { id: "foreman", name: "Foreman", hourlyRate: 23, active: true }],
    ]),
    jobIdByClockInId: new Map([["b", "foreman"]]),
    autoBreakByClockInId: new Map(),
    settings: { enabled: true, weeklyThresholdHours: 40, dailyThresholdHours: 8, weekStartsOn: 1, multiplier: 1.5, roundOvertimeMinutes: 0, automaticBreakMinutes: 0, minimumShiftHours: 0, timeZone: "America/Chicago" },
    roundDailyMinutes: 0,
    startDate: "2026-11-09",
    endDate: "2026-11-15",
  });
  const out = parse(toPayrollCsvWithOvertime(SUMMARY, "2026-11-09", "2026-11-15", rows, computeOvertimeTotals(rows, 0)));
  const header = out[1].join(",").replace(/"/g, "");
  assert.equal(header, "Employee,Shift Hours (decimal),Shift Hours (h:m),Break (decimal),Regular Hours (decimal),Overtime (decimal),Total Worked (decimal),Completed Sessions,Missing Clock-Outs,Hourly Rate,Estimated Pay (Excluding Break)");
  assert.deepEqual(out[2].slice(4, 7), ["8.00", "2.00", "10.00"]);
  assert.equal(out[2][9], "Mixed");
  assert.equal(out[2][10], "213.00");
  const dailyHeader = out[5].join(",").replace(/"/g, "");
  assert.equal(dailyHeader, "Employee,Date,Job,Hourly Rate,Shift Hours,Break,Regular Hours,Overtime,Total Worked,Estimated Pay");
  for (const r of out.slice(6)) {
    assert.equal((Number(r[6]) + Number(r[7])).toFixed(2), Number(r[8]).toFixed(2), r.join("|"));
  }
});
