// Overtime (Task 1) step 5 - Reports/exports rows with Overtime ON
// (lib/reportOvertime.ts). Plain Node, no emulator.
// Run via: node --test test/reportOvertime.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const {
  pairReportShifts,
  buildOvertimeReportRows,
  applyOvertimeOverrides,
  computeOvertimeTotals,
  effectiveOvertimeRate,
} = await import("../lib/reportOvertime.ts");
const { computeOvertime } = await import("../lib/overtime.ts");

const MIN = 60 * 1000;
// Chicago (CST, UTC-6) local time on Nov <day> 2026. Mon = Nov 9.
const ct = (day, hour, minute = 0) => Date.UTC(2026, 10, day, hour + 6, minute);

const JOBS = new Map([
  ["laborer", { id: "laborer", name: "Laborer", hourlyRate: 15, active: true }],
  ["foreman", { id: "foreman", name: "Foreman", hourlyRate: 23, active: true }],
  ["foremanFixed", { id: "foremanFixed", name: "Foreman Fixed", hourlyRate: 23, active: true, overtimeRate: 40 }],
]);
const EMP = new Map([
  ["juan", { name: "Juan", defaultJobId: "laborer", customRate: null, isSubcontractor: false, subcontractorName: null }],
  ["sub", { name: "Sub", defaultJobId: "laborer", customRate: null, isSubcontractor: true, subcontractorName: "SubCo" }],
]);

function settings(over = {}) {
  return {
    enabled: true,
    weeklyThresholdHours: 40,
    dailyThresholdHours: 8,
    weekStartsOn: 1,
    multiplier: 1.5,
    roundOvertimeMinutes: 0,
    automaticBreakMinutes: 0,
    minimumShiftHours: 0,
    timeZone: "America/Chicago",
    ...over,
  };
}

function build(shifts, over = {}, extra = {}) {
  return buildOvertimeReportRows({
    shifts,
    employees: EMP,
    jobs: JOBS,
    jobIdByClockInId: extra.jobIdByClockInId ?? new Map(),
    autoBreakByClockInId: extra.autoBreakByClockInId ?? new Map(),
    settings: settings(over),
    roundDailyMinutes: extra.roundDailyMinutes ?? 0,
    startDate: extra.startDate ?? "2026-11-09",
    endDate: extra.endDate ?? "2026-11-15",
  });
}

test("pairing matches the report's session rules (breaks, open shift, zero-length dropped)", () => {
  const shifts = pairReportShifts([
    { id: "in1", employeeId: "juan", type: "in", ms: ct(9, 7) },
    { id: "b1", employeeId: "juan", type: "breakStart", ms: ct(9, 10) },
    { id: "b2", employeeId: "juan", type: "breakEnd", ms: ct(9, 10, 30) },
    { id: "out1", employeeId: "juan", type: "out", ms: ct(9, 15) },
    { id: "in2", employeeId: "juan", type: "in", ms: ct(10, 7) },
    { id: "in3", employeeId: "juan", type: "in", ms: ct(11, 7) },
    { id: "out3", employeeId: "juan", type: "out", ms: ct(11, 7) },
  ]);
  assert.deepEqual(
    shifts.map((s) => [s.id, s.endMs === null ? "open" : (s.endMs - s.startMs) / MIN, s.breakMs / MIN]),
    [
      ["in1", 480, 30],
      ["in2", "open", 0],
    ]
  );
});

test("plan export example: 2-job day splits into job rows + a day total ($213)", () => {
  const shifts = [
    { id: "a", employeeId: "juan", startMs: ct(12, 7), endMs: ct(12, 12), breakMs: 0 },
    { id: "b", employeeId: "juan", startMs: ct(12, 12, 30), endMs: ct(12, 17, 30), breakMs: 0 },
  ];
  const rows = build(shifts, {}, { jobIdByClockInId: new Map([["b", "foreman"]]) });
  assert.deepEqual(
    rows.map((r) => [r.kind, r.jobLabel, r.workedMinutes / 60, r.overtimeMinutes / 60, Math.round(r.pay * 100) / 100]),
    [
      ["job", "Laborer", 5, 0, 75],
      ["job", "Foreman", 5, 2, 138],
      ["total", "Day total", 10, 2, 213],
    ]
  );
});

test("single-job day stays one row; no OT -> 0, Approve Hours job wins over default", () => {
  const rows = build(
    [{ id: "a", employeeId: "juan", startMs: ct(10, 8), endMs: ct(10, 14), breakMs: 0 }],
    {},
    { jobIdByClockInId: new Map([["a", "foremanFixed"]]) }
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "single");
  assert.equal(rows[0].jobLabel, "Foreman Fixed");
  assert.equal(rows[0].overtimeMinutes, 0);
  assert.equal(rows[0].pay, 6 * 23);
});

test("weekly OT counts days before the report start but only reports in-range days", () => {
  // Mon-Thu 10h each = 40h; Fri 5h -> all 5 OT. Report shows only Fri.
  const shifts = [9, 10, 11, 12].map((d) => ({ id: `d${d}`, employeeId: "juan", startMs: ct(d, 7), endMs: ct(d, 17), breakMs: 0 }));
  shifts.push({ id: "fri", employeeId: "juan", startMs: ct(13, 7), endMs: ct(13, 12), breakMs: 0 });
  const rows = build(shifts, { dailyThresholdHours: 0 }, { startDate: "2026-11-13", endDate: "2026-11-13" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-11-13");
  assert.equal(rows[0].overtimeMinutes, 300);
  assert.equal(rows[0].pay, 5 * 15 * 1.5);
});

test("daily worked rounding adds regular minutes to the last-worked job", () => {
  // 7:00-11:50 Laborer (290 min) + 12:00-15:58 Foreman (238 min) = 528 -> 540 at 15 min.
  const shifts = [
    { id: "a", employeeId: "juan", startMs: ct(12, 7), endMs: ct(12, 11, 50), breakMs: 0 },
    { id: "b", employeeId: "juan", startMs: ct(12, 12), endMs: ct(12, 15, 58), breakMs: 0 },
  ];
  const rows = build(shifts, { dailyThresholdHours: 0 }, { jobIdByClockInId: new Map([["b", "foreman"]]), roundDailyMinutes: 15 });
  assert.deepEqual(rows.map((r) => [r.jobLabel, r.workedMinutes]), [["Laborer", 290], ["Foreman", 250], ["Day total", 540]]);
});

test("report-only Job override works on single-job days only, OT hours unchanged", () => {
  const rows = build([
    { id: "a", employeeId: "juan", startMs: ct(10, 7), endMs: ct(10, 17), breakMs: 0 }, // 10h, 2 OT
    { id: "b", employeeId: "juan", startMs: ct(12, 7), endMs: ct(12, 12), breakMs: 0 },
    { id: "c", employeeId: "juan", startMs: ct(12, 12, 30), endMs: ct(12, 17, 30), breakMs: 0 },
  ], {}, { jobIdByClockInId: new Map([["c", "foreman"]]) });
  const overridden = applyOvertimeOverrides(
    rows,
    { "juan__2026-11-10": "foremanFixed", "juan__2026-11-12": "foremanFixed" },
    Array.from(JOBS.values()),
    1.5
  );
  const single = overridden.find((r) => r.date === "2026-11-10");
  assert.equal(single.overrideJobId, "foremanFixed");
  assert.equal(single.overtimeMinutes, 120);
  assert.equal(single.pay, 8 * 23 + 2 * 40);
  // 2-job day untouched (locked).
  assert.deepEqual(
    overridden.filter((r) => r.date === "2026-11-12").map((r) => r.overrideJobId),
    ["", "", ""]
  );
});

test("totals: single + day-total rows only, OT summed, total rounding at default rate", () => {
  const rows = build([
    { id: "a", employeeId: "juan", startMs: ct(10, 7), endMs: ct(10, 17, 5), breakMs: 0 }, // 10h05, 2h05 OT
    { id: "b", employeeId: "juan", startMs: ct(12, 7), endMs: ct(12, 12), breakMs: 0 },
    { id: "c", employeeId: "juan", startMs: ct(12, 12, 30), endMs: ct(12, 17, 30), breakMs: 0 },
  ], {}, { jobIdByClockInId: new Map([["c", "foreman"]]) });
  const totals = computeOvertimeTotals(rows, 15).get("juan");
  assert.equal(totals.totalOvertimeMinutes, 125 + 120);
  assert.equal(totals.totalWorkedMinutes, 1215); // 605 + 600 = 1205 -> 1215
  const dayPay = 8 * 15 + (125 / 60) * 22.5 + 213;
  assert.equal(Math.round(totals.totalPay * 100), Math.round((dayPay + (10 / 60) * 15) * 100));
});

test("subcontractors: OT hours shown, paid at the straight rate", () => {
  const rows = build([{ id: "a", employeeId: "sub", startMs: ct(10, 7), endMs: ct(10, 17), breakMs: 0 }]);
  assert.equal(rows[0].overtimeMinutes, 120);
  assert.equal(rows[0].overtimeRate, 15);
  assert.equal(rows[0].pay, 10 * 15);
  assert.equal(effectiveOvertimeRate(15, 40, 1.5, true), 15);
  assert.equal(effectiveOvertimeRate(15, null, 1.5, false), 22.5);
  assert.equal(effectiveOvertimeRate(null, 40, 1.5, false), null);
});

test("missing clock-out: day row flagged incomplete, no time assumed", () => {
  const rows = build([
    { id: "a", employeeId: "juan", startMs: ct(10, 7), endMs: ct(10, 12), breakMs: 0 },
    { id: "b", employeeId: "juan", startMs: ct(10, 13), endMs: null, breakMs: 0 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].incomplete, true);
  assert.equal(rows[0].workedMinutes, 300);
});

test("frozen Automatic Break on an approved shift is used instead of the live setting", () => {
  const base = { id: "x", startMs: ct(10, 7), endMs: ct(10, 15), breakMs: 0, jobId: "laborer" };
  const rates = () => ({ rate: 15, overtimeRate: null });
  const live = settings({ automaticBreakMinutes: 60, minimumShiftHours: 6 });
  assert.equal(computeOvertime([base], live, rates).totals.workedMs / MIN, 420);
  const frozen = { ...base, autoBreak: { minutes: 30, minimumShiftHours: 6 } };
  assert.equal(computeOvertime([frozen], live, rates).totals.workedMs / MIN, 450);
  assert.equal(computeOvertime([frozen], { ...live, enabled: false }, rates).totals.workedMs / MIN, 450);
  // Frozen "no auto break" (approved while it was off) stays off.
  const frozenOff = { ...base, autoBreak: { minutes: 0, minimumShiftHours: 0 } };
  assert.equal(computeOvertime([frozenOff], live, rates).totals.workedMs / MIN, 480);
});

test("decision 4B: frozen rates price the approved shift; same job at two rates splits rows", () => {
  const shifts = [
    { id: "a", employeeId: "juan", startMs: ct(10, 7), endMs: ct(10, 12), breakMs: 0 },
    { id: "b", employeeId: "juan", startMs: ct(10, 12, 30), endMs: ct(10, 17, 30), breakMs: 0 },
  ];
  const rows = buildOvertimeReportRows({
    shifts,
    employees: EMP,
    jobs: JOBS,
    jobIdByClockInId: new Map(),
    autoBreakByClockInId: new Map(),
    settings: settings(),
    roundDailyMinutes: 0,
    startDate: "2026-11-09",
    endDate: "2026-11-15",
    frozenRatesByClockInId: new Map([["b", { rate: 14, overtimeRate: 21 }]]), // approved at an older Laborer rate
  });
  assert.deepEqual(
    rows.map((r) => [r.kind, r.rate, r.overtimeMinutes / 60, r.ratesFrozen, Math.round(r.pay * 100) / 100]),
    [
      ["job", 15, 0, false, 75],
      ["job", 14, 2, true, 3 * 14 + 2 * 21],
      ["total", null, 2, false, 75 + 84],
    ]
  );
  assert.equal(new Set(rows.map((r) => r.key)).size, 3);
});
