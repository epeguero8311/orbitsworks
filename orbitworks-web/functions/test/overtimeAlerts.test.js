// Overtime (Task 1) step 6 - alerts. The periodic sweep with the company's
// Overtime toggle OFF (today's behaviour, new Overtime alert text) and ON
// (Max hours on the combined day total, Overtime week from "Week starts
// on" in the company time zone), plus the pure helpers in overtimeShifts.ts.
// Real compiled functions against the Firestore emulator; Expo is stubbed.
// Run (from functions/): firebase emulators:exec --only firestore "node --test test/overtimeAlerts.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-func-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Expo } = require("expo-server-sdk");
const admin = require("firebase-admin");

let sent = [];
Expo.prototype.sendPushNotificationsAsync = async (messages) => {
  sent.push(...messages);
  return messages.map(() => ({ status: "ok" }));
};

const funcs = require("../lib/index.js");
const { db } = require("../lib/shared.js");
const {
  shiftsFromClockEvents,
  companyOvertimeSettings,
  overtimeAlertMessage,
} = require("../lib/overtimeShifts.js");

// 2026-10-21 is a Wednesday, CDT (UTC-5).
const at = (hhmm, day = "2026-10-21") => Date.parse(`${day}T${hhmm}:00-05:00`);
const HOUR = 60 * 60 * 1000;

async function clearFirestore() {
  await fetch(`http://localhost:8090/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
}

const company = (c) => db.collection("companies").doc(c);

async function seedCompany(c, alerts = {}, extra = {}) {
  await company(c).set({
    businessHours: { open: "08:00", close: "23:59" },
    attendanceRules: { gracePeriodMinutes: 0 },
    weeklyOvertimeThreshold: 40,
    alerts: {
      maxHoursWarning: true,
      maxHoursThreshold: 12,
      overtimeWarning: false,
      missedClockOutAlert: false,
      maxBreakWarning: false,
      lateClockInAlert: false,
      earlyClockOutAlert: false,
      ...alerts,
    },
    ...extra,
  });
  await company(c).collection("employees").doc("e1").set({ name: "e1", active: true, linkedUserId: "uid-e1" });
}

async function addEvent(c, type, ms) {
  const ref = await company(c).collection("clockEvents").add({
    employeeId: "e1",
    employeeName: "Juan",
    siteId: null,
    siteName: null,
    type,
    timestamp: admin.firestore.Timestamp.fromMillis(ms),
  });
  return ref.id;
}

async function sweepAt(t, ms) {
  t.mock.timers.enable({ apis: ["Date"], now: ms });
  await funcs.checkPeriodicAlerts.run({});
}

const alertsOf = async (c, type) =>
  (await company(c).collection("alerts").where("alertType", "==", type).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const employeeAlertsOf = async (c, type) =>
  (await company(c).collection("employeeAlerts").get()).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => a.alertType === type);

test.beforeEach(async () => {
  await clearFirestore();
  process.env.ALERTS_FEED_ENABLED = "true";
  process.env.PUSH_NOTIFICATIONS_ENABLED = "true";
  delete process.env.TEST_COMPANY_IDS;
  sent = [];
});

// ---------------------------------------------------------------- pure helpers

const ev = (id, type, ms) => ({ id, employeeId: "e1", type, timestamp: admin.firestore.Timestamp.fromMillis(ms) });

test("shiftsFromClockEvents: closed + open shift, stale open shift dropped, running break counted", () => {
  const shifts = shiftsFromClockEvents(
    [
      ev("stale", "in", at("06:00")), // never clocked out, then a new "in": dropped
      ev("a", "in", at("08:00")),
      ev("b1", "breakStart", at("10:00")),
      ev("b2", "breakEnd", at("10:30")),
      ev("aOut", "out", at("13:00")),
      ev("c", "in", at("14:00")),
      ev("c1", "breakStart", at("20:00")),
    ],
    at("21:00")
  );
  assert.deepEqual(
    shifts.map((s) => [s.id, s.endMs === null ? "open" : (s.endMs - s.startMs) / HOUR, s.breakMs / HOUR]),
    [
      ["a", 5, 0.5],
      ["c", "open", 1], // break running since 20:00 -> 1h at 21:00
    ]
  );
});

test("companyOvertimeSettings: OFF and same defaults as the website", () => {
  const s = companyOvertimeSettings({});
  assert.equal(s.enabled, false);
  assert.equal(s.weeklyThresholdHours, 40);
  assert.equal(s.dailyThresholdHours, 0);
  assert.equal(s.weekStartsOn, 1);
  assert.equal(s.multiplier, 1.5);
  assert.equal(s.roundOvertimeMinutes, 0);
  assert.equal(s.timeZone, "America/Chicago");
  const on = companyOvertimeSettings({
    overtimeEnabled: true,
    overtimeWeekStartsOn: 0,
    overtimeRoundMinutes: 10, // invalid -> 0
    timezone: "America/New_York",
    exportSettings: { automaticBreakMinutes: 30, minimumShiftHours: 6 },
  });
  assert.deepEqual([on.enabled, on.weekStartsOn, on.roundOvertimeMinutes, on.timeZone, on.automaticBreakMinutes], [true, 0, 0, "America/New_York", 30]);
});

test("overtimeAlertMessage: plan text", () => {
  assert.equal(overtimeAlertMessage("Juan", 41.27), "Juan has reached overtime (41.2h)");
  assert.equal(overtimeAlertMessage("Juan", 40), "Juan has reached overtime (40h)");
});

// ---------------------------------------------------------------- Overtime OFF

test("OFF: Overtime alert keeps today's logic, new text; employee alert unchanged", async (t) => {
  await seedCompany("c-ot-off", { overtimeWarning: true, maxHoursWarning: false }, { weeklyOvertimeThreshold: 1 });
  await addEvent("c-ot-off", "in", at("08:00"));
  await sweepAt(t, at("11:00"));
  const ot = await alertsOf("c-ot-off", "overtime");
  assert.equal(ot.length, 1);
  assert.equal(ot[0].message, "Juan has reached overtime (3h)");
  // The supervisor push body is this same alert.message (pushSend.ts).
  assert.equal((await employeeAlertsOf("c-ot-off", "overtime")).length, 1);
});

test("OFF: Max hours still per shift (5h closed + 7h open does not fire at 12)", async (t) => {
  await seedCompany("c-mh-off");
  await addEvent("c-mh-off", "in", at("08:00"));
  await addEvent("c-mh-off", "out", at("13:00"));
  await addEvent("c-mh-off", "in", at("14:00"));
  await sweepAt(t, at("21:00"));
  assert.equal((await alertsOf("c-mh-off", "maxHours")).length, 0);
});

// ---------------------------------------------------------------- Overtime ON

test("ON: Max hours counts the combined day (plan: 5h + clock in 2pm, Max 12 -> fires at 9pm)", async (t) => {
  await seedCompany("c-mh-on", {}, { overtimeEnabled: true });
  await addEvent("c-mh-on", "in", at("08:00"));
  await addEvent("c-mh-on", "out", at("13:00"));
  await addEvent("c-mh-on", "in", at("14:00"));
  await sweepAt(t, at("20:50"));
  assert.equal((await alertsOf("c-mh-on", "maxHours")).length, 0);
  t.mock.timers.setTime(at("21:00"));
  await funcs.checkPeriodicAlerts.run({});
  const sup = await alertsOf("c-mh-on", "maxHours");
  assert.equal(sup.length, 1);
  assert.equal(sup[0].dateKey, "2026-10-21");
  const mine = await employeeAlertsOf("c-mh-on", "maxHours");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, "maxHours-e1-2026-10-21");
  assert.match(mine[0].message, /hours today/);
});

test("ON: Max hours fires once per day even across a third shift", async (t) => {
  await seedCompany("c-mh-on2", { maxHoursThreshold: 6 }, { overtimeEnabled: true });
  await addEvent("c-mh-on2", "in", at("06:00"));
  await addEvent("c-mh-on2", "out", at("12:30"));
  await addEvent("c-mh-on2", "in", at("13:00"));
  await sweepAt(t, at("13:30"));
  await addEvent("c-mh-on2", "out", at("14:00"));
  await addEvent("c-mh-on2", "in", at("15:00"));
  t.mock.timers.setTime(at("15:30"));
  await funcs.checkPeriodicAlerts.run({});
  assert.equal((await alertsOf("c-mh-on2", "maxHours")).length, 1);
  assert.equal((await employeeAlertsOf("c-mh-on2", "maxHours")).length, 1);
});

test("ON: a running break doesn't count toward Max hours", async (t) => {
  await seedCompany("c-mh-brk", { maxHoursThreshold: 4 }, { overtimeEnabled: true });
  await addEvent("c-mh-brk", "in", at("08:00"));
  await addEvent("c-mh-brk", "breakStart", at("11:00"));
  await sweepAt(t, at("13:00")); // 3h worked, 2h on break
  assert.equal((await alertsOf("c-mh-brk", "maxHours")).length, 0);
});

test("ON: Overtime week follows Week starts on; text and employee alert as OFF", async (t) => {
  // Sunday-start week: Sun Oct 18 counts toward the week of Wed Oct 21.
  await seedCompany("c-ot-on", { overtimeWarning: true, maxHoursWarning: false }, {
    overtimeEnabled: true,
    overtimeWeekStartsOn: 0,
    weeklyOvertimeThreshold: 10,
  });
  await addEvent("c-ot-on", "in", at("08:00", "2026-10-18"));
  await addEvent("c-ot-on", "out", at("16:00", "2026-10-18")); // 8h Sunday
  await addEvent("c-ot-on", "in", at("08:00"));
  await sweepAt(t, at("11:00")); // + 3h Wed = 11h > 10
  const ot = await alertsOf("c-ot-on", "overtime");
  assert.equal(ot.length, 1);
  assert.equal(ot[0].dateKey, "2026-10-18");
  assert.equal(ot[0].message, "Juan has reached overtime (11h)");
  const mine = await employeeAlertsOf("c-ot-on", "overtime");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, "overtime-e1-2026-10-18");
});

test("ON: Monday-start week leaves Sunday out; weekly 0 = no warning", async (t) => {
  await seedCompany("c-ot-mon", { overtimeWarning: true, maxHoursWarning: false }, {
    overtimeEnabled: true,
    weeklyOvertimeThreshold: 10,
  });
  await addEvent("c-ot-mon", "in", at("08:00", "2026-10-18"));
  await addEvent("c-ot-mon", "out", at("16:00", "2026-10-18"));
  await addEvent("c-ot-mon", "in", at("08:00"));
  await sweepAt(t, at("11:00"));
  assert.equal((await alertsOf("c-ot-mon", "overtime")).length, 0);

  await seedCompany("c-ot-zero", { overtimeWarning: true, maxHoursWarning: false }, {
    overtimeEnabled: true,
    weeklyOvertimeThreshold: 0,
  });
  await addEvent("c-ot-zero", "in", at("08:00"));
  t.mock.timers.setTime(at("11:00"));
  await funcs.checkPeriodicAlerts.run({});
  assert.equal((await alertsOf("c-ot-zero", "overtime")).length, 0);
});
