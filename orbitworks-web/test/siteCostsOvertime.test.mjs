// Overtime (Task 1) step 9 - Job Site Cost Analytics with Overtime ON
// (lib/siteCostsOvertime.ts). Plain Node.
// Run via: node --test test/siteCostsOvertime.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { computeAnalyticsWithOvertime } = await import("../lib/siteCostsOvertime.ts");

const ct = (day, hour, minute = 0) => Date.UTC(2026, 10, day, hour + 6, minute);
const r2 = (n) => Math.round(n * 100) / 100;

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
const JOBS = new Map([
  ["laborer", { hourlyRate: 15 }],
  ["foreman", { hourlyRate: 23, overtimeRate: 40, overtimeRateHistory: [{ overtimeRate: null, effectiveFrom: "1970-01-01" }, { overtimeRate: 40, effectiveFrom: "2026-11-17" }] }],
]);

function shiftEvents(id, employeeId, siteId, inMs, outMs) {
  const base = { employeeId, employeeName: employeeId, siteId, siteName: siteId ? `Site ${siteId}` : "" };
  return [
    { ...base, id, type: "in", timestampMs: inMs },
    { ...base, id: `${id}-out`, type: "out", timestampMs: outMs },
  ];
}

function run(events, over = {}) {
  return computeAnalyticsWithOvertime({
    events,
    rangeStart: "2026-11-16",
    rangeEnd: "2026-11-22",
    employeesById: new Map([
      ["e1", { jobId: "laborer", hourlyRate: null, isSubcontractor: false }],
      ["sub", { jobId: "laborer", hourlyRate: null, isSubcontractor: true }],
    ]),
    jobsById: JOBS,
    unapprovedClockInIds: new Set(),
    jobIdByClockInId: new Map(),
    autoBreakByClockInId: new Map(),
    frozenOvertimeMinutesByClockInId: new Map(),
    settings: SETTINGS,
    nowMs: ct(25, 12),
    siteFilter: null,
    workerFilter: "all",
    ...over,
  });
}

test("plan example: 5h Site A + 9h Site B, 6h OT -> A 2.14h, B 3.86h; totals match the export", () => {
  const s = run([...shiftEvents("a", "e1", "A", ct(16, 8), ct(16, 13)), ...shiftEvents("b", "e1", "B", ct(16, 14), ct(16, 23))]);
  const A = s.siteReports.find((x) => x.siteId === "A");
  const B = s.siteReports.find((x) => x.siteId === "B");
  assert.equal(r2(A.otHours), 2.14);
  assert.equal(r2(B.otHours), 3.86);
  assert.equal(r2(A.hours), 5);
  assert.equal(r2(B.hours), 9);
  // Straight time stays on its site; the OT premium (6h x $7.50) is shared.
  assert.equal(r2(A.cost), r2(75 + 45 * (5 / 14)));
  assert.equal(r2(B.cost), r2(135 + 45 * (9 / 14)));
  assert.equal(r2(s.totalLaborCost), 255); // = export Est. Pay for example A
  assert.equal(r2(s.totalOtCost), 135);
});

test("Approve Hours job + its OT rate history as of the day; subcontractors no premium", () => {
  // Mon Nov 16 (Foreman OT rate not set yet -> 1.5x) and Tue Nov 17 ($40).
  const events = [...shiftEvents("m", "e1", "A", ct(16, 7), ct(16, 17)), ...shiftEvents("t", "e1", "A", ct(17, 7), ct(17, 17))];
  const s = run(events, { jobIdByClockInId: new Map([["m", "foreman"], ["t", "foreman"]]) });
  // Each day: 8 x $23 + 2h OT; Mon 2 x 34.50, Tue 2 x 40.
  assert.equal(r2(s.totalLaborCost), 2 * 184 + 69 + 80);
  const sub = run(shiftEvents("x", "sub", "A", ct(16, 7), ct(16, 17)));
  assert.equal(r2(sub.siteReports[0].otHours), 2);
  assert.equal(r2(sub.totalLaborCost), 150);
});

test("frozen OT on approved shifts; live shift counts to now; site filter", () => {
  const frozen = run(shiftEvents("a", "e1", "A", ct(16, 7), ct(16, 17)), {
    frozenOvertimeMinutesByClockInId: new Map([["a", 60]]),
  });
  assert.equal(r2(frozen.totalOtCost), 22.5);

  const live = run(
    [{ id: "open", employeeId: "e1", employeeName: "e1", siteId: "A", siteName: "Site A", type: "in", timestampMs: ct(18, 7) }],
    { nowMs: ct(18, 17) }
  );
  assert.equal(r2(live.totalHours), 10);
  assert.equal(r2(live.siteReports[0].otHours), 2);
  assert.equal(live.employeeSiteCosts[0].isLive, true);

  const filtered = run(
    [...shiftEvents("a", "e1", "A", ct(16, 8), ct(16, 13)), ...shiftEvents("b", "e1", "B", ct(16, 14), ct(16, 23))],
    { siteFilter: "B" }
  );
  assert.deepEqual(filtered.siteReports.map((x) => x.siteId), ["B"]);
  assert.equal(r2(filtered.siteReports[0].otHours), 3.86);
});
