// Reports group days by the company time zone, not UTC
// (docs/plans/reports-utc-day-grouping-fix.md). A 7pm-11pm shift must land
// on its start day in every Overtime-OFF report and export.
// Plain Node, no emulator. Run via: node --test test/reportsTimeZone.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const { computePayrollAndSessions, computeAttendanceAndSiteReports } = await import("../lib/reportComputations.ts");
const { buildDayRows, addPayrollSheet } = await import("../lib/payrollExcelSheets.ts");
const { defaultReportRange } = await import("../lib/reportUtils.ts");
const { overtimeDayKey, overtimeWeekKey } = await import("../lib/overtime.ts");

const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const ev = (employeeId, id, type, ms) => ({ id, employeeId, employeeName: employeeId, siteId: "s1", siteName: "Site", type, timestamp: ts(ms) });
// Chicago wall time in November (CST = UTC-6).
const ct = (day, hour, minute = 0) => Date.UTC(2026, 10, day, hour + 6, minute);

test("Overtime OFF payroll: a 7pm-11pm Chicago shift stays on its start day (hours, break, tips, trends)", () => {
  const events = [
    ev("juan", "in1", "in", ct(10, 19)), // Tue Nov 10 7:00 PM = Wed 01:00 UTC
    ev("juan", "b1", "breakStart", ct(10, 21)),
    ev("juan", "b2", "breakEnd", ct(10, 21, 30)),
    ev("juan", "out1", "out", ct(10, 23)),
  ];
  const r = computePayrollAndSessions(events, new Map(), new Map([["juan", 15]]), 0, 0, new Map(), new Map([["in1", 2000]]), "America/Chicago");
  assert.deepEqual([...r.hoursByEmployeeDay.keys()], ["juan__2026-11-10"]);
  assert.equal(r.hoursByEmployeeDay.get("juan__2026-11-10"), 4);
  assert.equal(r.breakHoursByEmployeeDay.get("juan__2026-11-10"), 0.5);
  assert.equal(r.tipsByEmployeeDay.get("juan__2026-11-10"), 20);
  assert.deepEqual(r.hoursPerDay.map((p) => p.dateLabel), ["Nov 10"]);
});

test("the time zone comes from the company (America/New_York 11:30pm stays on its day)", () => {
  // Nov 10 11:30 PM Eastern = Nov 11 04:30 UTC; in Chicago it is 10:30 PM Nov 10.
  const inMs = Date.UTC(2026, 10, 11, 4, 30);
  const events = [ev("ana", "in1", "in", inMs), ev("ana", "out1", "out", inMs + 60 * 60 * 1000)];
  const ny = computePayrollAndSessions(events, new Map(), new Map(), 0, 0, new Map(), new Map(), "America/New_York");
  assert.deepEqual([...ny.hoursByEmployeeDay.keys()], ["ana__2026-11-10"]);
  // Nov 11 00:30 Eastern on a London-time company is already Nov 11.
  const london = computePayrollAndSessions(events, new Map(), new Map(), 0, 0, new Map(), new Map(), "Europe/London");
  assert.deepEqual([...london.hoursByEmployeeDay.keys()], ["ana__2026-11-11"]);
});

test("no time zone passed = America/Chicago (company fallback)", () => {
  const events = [ev("juan", "in1", "in", ct(10, 19)), ev("juan", "out1", "out", ct(10, 23))];
  const r = computePayrollAndSessions(events, new Map(), new Map(), 0, 0);
  assert.deepEqual([...r.hoursByEmployeeDay.keys()], ["juan__2026-11-10"]);
});

test("Payroll Hours Excel (Overtime OFF): evening shift row on its start day, approved job + tips line up", () => {
  const events = [
    ev("juan", "in1", "in", ct(10, 19)),
    ev("juan", "out1", "out", ct(10, 23)),
    ev("juan", "in2", "in", ct(11, 8)),
    ev("juan", "out2", "out", ct(11, 12)),
  ];
  const r = computePayrollAndSessions(events, new Map(), new Map([["juan", 15]]), 0, 0, new Map(), new Map([["in1", 2000]]), "America/Chicago");
  const jobs = [
    { id: "laborer", name: "Laborer", hourlyRate: 15, active: true },
    { id: "foreman", name: "Foreman", hourlyRate: 23, active: true },
  ];
  // Approve Hours job, keyed by timesheetApprovals.date (server Chicago day).
  const approvedJob = new Map([["juan__2026-11-10", "foreman"]]);
  const dayRows = buildDayRows(r.summaries, r.hoursByEmployeeDay, r.breakHoursByEmployeeDay, new Map([["juan", "laborer"]]), jobs, 0, approvedJob, r.tipsByEmployeeDay);
  assert.deepEqual(
    dayRows.map((d) => [d.dateKey, d.hours, d.defaultJobName, d.tips]),
    [
      ["2026-11-10", 4, "Foreman", 20],
      ["2026-11-11", 4, "Laborer", 0],
    ]
  );
  const wb = new ExcelJS.Workbook();
  addPayrollSheet(wb, r.summaries, jobs, dayRows, 0, "Acme", "2026-11-09", "2026-11-15", true);
  const sheet = wb.getWorksheet("Payroll Hours");
  // Summary header row 2, one employee row 3, daily title 6, header 7, rows 8-9.
  assert.equal(sheet.getCell(8, 2).value, "Nov 10, 2026");
  assert.equal(sheet.getCell(8, 3).value, "Foreman");
  assert.equal(sheet.getCell(8, 8).value, 20);
  assert.equal(sheet.getCell(9, 2).value, "Nov 11, 2026");
});

test("OT Test Co Emilio, Overtime OFF: Nov 25 7:10 PM shift on Nov 25 (was merged into Nov 26), $234 tips on Nov 26", () => {
  const shifts = [
    ["b58ca808", 1795655449679, 1795655480551, [[1795655456782, 1795655472611]]],
    ["852d03f2", 1795703916449, 1795708055378, [[1795703929329, 1795703930269], [1795703934039, 1795704465128]]],
    ["ddccba1a", 1795708081486, 1795715460484, [[1795708233800, 1795708420487], [1795708722237, 1795708871819]]],
    ["b3805431", 1795716364827, 1795721247058, [[1795716634634, 1795718917540], [1795720110565, 1795721243041]]],
    ["df87aba2", 1795722028059, 1795725437556, [[1795722034625, 1795722877363], [1795722882083, 1795725347585]]],
    ["94c5adf8", 1795725456563, 1795726232810, []],
  ];
  const events = [];
  for (const [id, inMs, outMs, breaks] of shifts) {
    events.push(ev("kiosk-admin", id, "in", inMs));
    breaks.forEach(([s, e], i) => {
      events.push(ev("kiosk-admin", `${id}-bs${i}`, "breakStart", s));
      events.push(ev("kiosk-admin", `${id}-be${i}`, "breakEnd", e));
    });
    events.push(ev("kiosk-admin", `${id}-out`, "out", outMs));
  }
  const tips = new Map([["852d03f2", 10000], ["ddccba1a", 6700], ["b3805431", 6700]]);
  const r = computePayrollAndSessions(events, new Map(), new Map([["kiosk-admin", 15]]), 0, 0, new Map(), tips, "America/Chicago");
  const dayRows = buildDayRows(r.summaries, r.hoursByEmployeeDay, r.breakHoursByEmployeeDay, new Map(), [], 0, new Map(), r.tipsByEmployeeDay);
  assert.deepEqual(
    dayRows.map((d) => [d.dateKey, Number(d.hours.toFixed(2)), Number(d.breakHours.toFixed(2)), Number(d.workedHours.toFixed(2)), d.tips]),
    [
      // Whole minutes per day, same as the Overtime ON rows: 30.9 s clocked
      // = 1 min, 15.8 s break = 0 min, worked 1 min (0.02 h).
      ["2026-11-25", 0.02, 0, 0.02, 0],
      ["2026-11-26", 5.72, 2.12, 3.6, 234],
    ]
  );
  assert.equal(r.summaries[0].sessionCount, 6);
});

test("attendance: evening shift's record is on its start day and finds that day's break", () => {
  const events = [
    ev("juan", "in1", "in", ct(10, 19)),
    ev("juan", "b1", "breakStart", ct(10, 20)),
    ev("juan", "b2", "breakEnd", ct(10, 20, 30)),
  ];
  const payroll = computePayrollAndSessions(
    [...events, ev("juan", "out1", "out", ct(10, 23))],
    new Map(),
    new Map(),
    0,
    0,
    new Map(),
    new Map(),
    "America/Chicago"
  );
  // Out at 11 PM, still Nov 10 in Chicago (05:00 UTC Nov 11).
  const att = computeAttendanceAndSiteReports(
    [...events, ev("juan", "out1", "out", ct(10, 23))],
    payroll.siteHoursTotal,
    payroll.siteCostTotal,
    new Map(),
    "08:00",
    0,
    payroll.breakHoursByEmployeeDay,
    "America/Chicago"
  );
  assert.deepEqual(att.attendanceRecords.map((a) => [a.date, a.breakHours]), [["2026-11-10", 0.5]]);
  assert.deepEqual(att.employeesPerDay.map((p) => p.date), ["Nov 10"]);
});

test("defaultReportRange: this week (Monday) to today in the company time zone", () => {
  // Thu Nov 26 2026 8:30 PM Chicago = Fri Nov 27 02:30 UTC.
  assert.deepEqual(defaultReportRange("America/Chicago", Date.UTC(2026, 10, 27, 2, 30)), { start: "2026-11-23", end: "2026-11-26" });
  // Sun Nov 29 9 PM Chicago (Mon Nov 30 UTC) is still the week of Nov 23.
  assert.deepEqual(defaultReportRange("America/Chicago", Date.UTC(2026, 10, 30, 3, 0)), { start: "2026-11-23", end: "2026-11-29" });
  // Monday morning.
  assert.deepEqual(defaultReportRange("America/Chicago", Date.UTC(2026, 10, 30, 15, 0)), { start: "2026-11-30", end: "2026-11-30" });
});

test("Time History (Overtime OFF) week: Sunday 9 PM Chicago shift is in the week that started Monday before", () => {
  // The hook's week key: overtimeWeekKey(overtimeDayKey(start, tz), 1).
  const sunday9pm = Date.UTC(2026, 10, 30, 3, 0); // Mon Nov 30 03:00 UTC
  assert.equal(overtimeWeekKey(overtimeDayKey(sunday9pm, "America/Chicago"), 1), "2026-11-23");
});
