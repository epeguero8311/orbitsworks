// Overtime (Task 1) step 8 - Approve Hours with Overtime ON: Automatic
// Break once per day, combined-day Max hours, per-shift Overtime flag,
// frozen OT + the re-approve warning, and frozen OT in exports.
// Run via: node --test test/approvalsOvertime.test.mjs
import "./helpers/aliasHooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { computeApprovalsOvertime } = await import("../lib/approvalsOvertime.ts");
const { evaluateSessionWarnings } = await import("../lib/sessionWarnings.ts");
const { buildOvertimeReportRows } = await import("../lib/reportOvertime.ts");

const H = 60 * 60 * 1000;
const ct = (day, hour, minute = 0) => Date.UTC(2026, 10, day, hour + 6, minute);
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
const SNAPSHOT = { weeklyThresholdHours: 40, dailyThresholdHours: 8, weekStartsOn: 1, multiplier: 1.5, roundOvertimeMinutes: 0, timeZone: "America/Chicago" };

function evs(list) {
  return list.flatMap(([id, inMs, outMs]) => [
    { id, employeeId: "e1", type: "in", ms: inMs },
    { id: `${id}-out`, employeeId: "e1", type: "out", ms: outMs },
  ]);
}

test("Automatic Break once per day + combined day for Max hours", () => {
  const info = computeApprovalsOvertime(
    evs([["a", ct(16, 8), ct(16, 13)], ["b", ct(16, 14), ct(16, 21)]]),
    new Map(),
    { ...SETTINGS, automaticBreakMinutes: 30, minimumShiftHours: 6 }
  );
  assert.equal(info.get("a").breakMs, 0);
  assert.equal(info.get("b").breakMs, 0.5 * H); // once, on the day's last shift
  assert.equal(info.get("a").dayWorkedMs, 11.5 * H);
  assert.equal(info.get("b").overtimeMs, 3.5 * H);
});

test("re-approve warning: frozen OT moved by an edit elsewhere, not by a settings change", () => {
  // Approved Tue 10h with 2h OT frozen. Mon (pending) is 5h, so no change.
  const approvals = new Map([["tue", { status: "approved", overtimeApplied: { overtimeMinutes: 120, settings: SNAPSHOT } }]]);
  const same = computeApprovalsOvertime(evs([["mon", ct(16, 8), ct(16, 13)], ["tue", ct(17, 7), ct(17, 17)]]), approvals, SETTINGS);
  assert.equal(same.get("tue").overtimeChanged, null);
  assert.equal(same.get("tue").frozen, true);

  // Settings changed to daily 6 after approval: frozen stays 2h, no warning.
  const settingsChanged = computeApprovalsOvertime(
    evs([["mon", ct(16, 8), ct(16, 13)], ["tue", ct(17, 7), ct(17, 17)]]),
    approvals,
    { ...SETTINGS, dailyThresholdHours: 6 }
  );
  assert.equal(settingsChanged.get("tue").overtimeMs, 2 * H);
  assert.equal(settingsChanged.get("tue").overtimeChanged, null);

  // Weekly-only company: an earlier unapproved day grew so the approved
  // Fri now crosses 40 earlier -> warning.
  const weekly = { ...SNAPSHOT, dailyThresholdHours: 0 };
  const fri = new Map([["fri", { status: "approved", overtimeApplied: { overtimeMinutes: 0, settings: weekly } }]]);
  const days = [16, 17, 18, 19].map((d) => [`d${d}`, ct(d, 7), ct(d, 16)]); // 36h
  const edited = computeApprovalsOvertime(evs([...days, ["fri", ct(20, 7), ct(20, 16)]]), fri, { ...SETTINGS, dailyThresholdHours: 0 });
  assert.deepEqual(edited.get("fri").overtimeChanged, { frozenMinutes: 0, liveMinutes: 300 });
  assert.equal(edited.get("fri").overtimeMs, 0); // still frozen until re-approved
});

const BASE_WARNING_INPUT = {
  clockInEvent: { id: "a", type: "in", employeeId: "e1" },
  clockOutEvent: { id: "a-out", type: "out", employeeId: "e1" },
  hours: 7,
  breakHours: 0,
  realBreakHours: 0,
  weekHoursThroughSession: 12,
  assignedSiteNames: [],
  alerts: {
    maxHoursWarning: true,
    maxHoursThreshold: 12,
    overtimeWarning: true,
    missedClockOutAlert: false,
    maxBreakWarning: false,
    maxBreakMinutes: 15,
    missedClockOutMinutes: 30,
    clockedInOutsideGeofence: false,
    siteMismatchWarning: false,
    lateClockInAlert: false,
    earlyClockOutAlert: false,
    leftJobSiteAlert: false,
    faceMismatchAlert: false,
    faceNoFaceAlert: false,
  },
  businessHours: { open: "08:00", close: "17:00" },
  gracePeriodMinutes: 0,
  weeklyOvertimeThreshold: 40,
  faceVerification: { alertsEnabled: true },
  isPro: false,
};
const types = (ws) => ws.map((w) => w.type).sort();

test("warnings: OFF = per shift as before; ON = combined day, shift OT, re-approve", () => {
  assert.deepEqual(types(evaluateSessionWarnings(BASE_WARNING_INPUT)), []);
  const on = evaluateSessionWarnings({
    ...BASE_WARNING_INPUT,
    overtimeOn: { dayWorkedHours: 12, shiftOvertimeHours: 4, changed: { frozenHours: 0, liveHours: 5 } },
  });
  assert.deepEqual(types(on), ["maxHours", "overtime", "overtimeChanged"]);
  const max = on.find((w) => w.type === "maxHours");
  assert.equal(max.combinedDay, true);
  assert.equal(max.hours, 12);
  assert.equal(on.find((w) => w.type === "overtime").shiftOvertimeHours, 4);
  // ON with no OT on the shift: no Overtime flag even past the weekly number.
  const noOt = evaluateSessionWarnings({
    ...BASE_WARNING_INPUT,
    weekHoursThroughSession: 45,
    overtimeOn: { dayWorkedHours: 7, shiftOvertimeHours: 0, changed: null },
  });
  assert.deepEqual(types(noOt), []);
});

test("exports use the frozen OT of approved shifts", () => {
  const rows = buildOvertimeReportRows({
    shifts: [{ id: "a", employeeId: "e1", startMs: ct(16, 7), endMs: ct(16, 17), breakMs: 0 }],
    employees: new Map([["e1", { name: "Juan", defaultJobId: "laborer", customRate: null, isSubcontractor: false, subcontractorName: null }]]),
    jobs: new Map([["laborer", { id: "laborer", name: "Laborer", hourlyRate: 15, active: true }]]),
    jobIdByClockInId: new Map(),
    autoBreakByClockInId: new Map(),
    settings: { ...SETTINGS, dailyThresholdHours: 6 }, // live would be 4h
    roundDailyMinutes: 0,
    startDate: "2026-11-16",
    endDate: "2026-11-22",
    frozenOvertimeMinutesByClockInId: new Map([["a", 120]]),
  });
  assert.equal(rows[0].overtimeMinutes, 120);
  assert.equal(rows[0].pay, 8 * 15 + 2 * 22.5);
});
