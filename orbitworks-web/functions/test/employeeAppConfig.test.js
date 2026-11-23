// Employee App - syncEmployeeAppConfig (functions/src/employeeAppConfig.ts).
// Runs the REAL compiled trigger handler (lib/) against the Firestore
// emulator, same `.run(event)` duck-typed event approach as alerts.test.js.
//
// Usage (from functions/, after `npm run build`):
//   firebase emulators:exec --only firestore "node --test test/employeeAppConfig.test.js"
process.env.GCLOUD_PROJECT = "orbitworks-func-test";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8090";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildEmployeeAppConfig, syncEmployeeAppConfig } = require("../lib/employeeAppConfig");
const { db } = require("../lib/shared");

const COMPANY = "cfgCompany";
const configRef = () => db.collection("companies").doc(COMPANY).collection("employeeAppConfig").doc("current");

function writeEvent(before, after) {
  const snap = (data) => (data === undefined ? undefined : { data: () => data });
  return { params: { companyId: COMPANY }, data: { before: snap(before), after: snap(after) } };
}

test.beforeEach(async () => {
  await configRef().delete();
});

test("defaults: empty company doc gets safe defaults, no billing fields", () => {
  const cfg = buildEmployeeAppConfig({});
  assert.equal(cfg.name, null);
  assert.equal(cfg.isPro, false);
  assert.equal(cfg.timezone, "America/Chicago");
  assert.deepEqual(cfg.businessHours, { open: "08:00", close: "17:00" });
  assert.equal(cfg.gracePeriodMinutes, 0);
  assert.equal(cfg.weeklyOvertimeThreshold, 40);
  assert.deepEqual(cfg.breaks, { maxBreakWarning: true, maxBreakMinutes: 15, automaticBreakMinutes: 0, minimumShiftHours: 0 });
  assert.deepEqual(cfg.autoClockOut, { enabled: false, maxWorkedHours: 12 });
  assert.equal(cfg.alerts.lateClockInAlert, true);
});

test("maps every requested setting and never copies billing/plan fields", () => {
  const cfg = buildEmployeeAppConfig({
    name: "Acme",
    logoUrl: "https://example.com/logo.jpg",
    planTier: "pro_tier2",
    stripeCustomerId: "cus_secret",
    subscriptionStatus: "active",
    activeEmployeeCount: 12,
    timezone: "America/New_York",
    businessHours: { open: "07:00", close: "15:30" },
    attendanceRules: { gracePeriodMinutes: 5, requireOverrideReason: false },
    weeklyOvertimeThreshold: 44,
    alerts: { maxBreakMinutes: 30, maxBreakWarning: false, lateClockInAlert: false, junk: "x" },
    exportSettings: { automaticBreakMinutes: 30, minimumShiftHours: 6, roundDailyMinutes: 15 },
    autoClockOut: { enabled: true, maxWorkedHours: 10 },
  });
  assert.equal(cfg.name, "Acme");
  assert.equal(cfg.isPro, true);
  assert.equal(cfg.timezone, "America/New_York");
  assert.deepEqual(cfg.businessHours, { open: "07:00", close: "15:30" });
  assert.equal(cfg.gracePeriodMinutes, 5);
  assert.equal(cfg.weeklyOvertimeThreshold, 44);
  assert.deepEqual(cfg.breaks, { maxBreakWarning: false, maxBreakMinutes: 30, automaticBreakMinutes: 30, minimumShiftHours: 6 });
  assert.deepEqual(cfg.autoClockOut, { enabled: true, maxWorkedHours: 10 });
  assert.equal(cfg.alerts.lateClockInAlert, false);
  assert.equal("junk" in cfg.alerts, false);
  const json = JSON.stringify(cfg);
  for (const banned of ["cus_secret", "pro_tier2", "stripe", "subscription", "activeEmployeeCount"]) {
    assert.equal(json.includes(banned), false, `config leaked ${banned}`);
  }
});

test("trigger writes the mirror on create and re-syncs when a mirrored setting changes", async () => {
  await syncEmployeeAppConfig.run(writeEvent(undefined, { name: "Acme", autoClockOut: { maxWorkedHours: 12 } }));
  assert.equal((await configRef().get()).data().name, "Acme");

  await syncEmployeeAppConfig.run(
    writeEvent({ name: "Acme", autoClockOut: { maxWorkedHours: 12 } }, { name: "Acme", autoClockOut: { maxWorkedHours: 9 } })
  );
  assert.equal((await configRef().get()).data().autoClockOut.maxWorkedHours, 9);

  await syncEmployeeAppConfig.run(writeEvent({ name: "Acme" }, { name: "Acme", weeklyOvertimeThreshold: 50 }));
  assert.equal((await configRef().get()).data().weeklyOvertimeThreshold, 50);
});

test("trigger skips writes that don't touch mirrored settings", async () => {
  await configRef().set({ marker: "untouched" });
  await syncEmployeeAppConfig.run(
    writeEvent({ name: "Acme", activeEmployeeCount: 1 }, { name: "Acme", activeEmployeeCount: 2, stripeCustomerId: "cus_1" })
  );
  assert.equal((await configRef().get()).data().marker, "untouched");
});

test("trigger deletes the mirror when the company is deleted", async () => {
  await configRef().set({ name: "Acme" });
  await syncEmployeeAppConfig.run(writeEvent({ name: "Acme" }, undefined));
  assert.equal((await configRef().get()).exists, false);
});
