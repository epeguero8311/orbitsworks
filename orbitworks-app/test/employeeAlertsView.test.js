// Employee App Phase 7 - the Alerts tab rows (lib/employeeAlertsView.js):
// server alerts + this phone's fired break reminders, newest first, 50 max,
// with the "why" line and the time label.
// Run: node --test test/employeeAlertsView.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../lib/employeeAlertsView");
const r = require("../lib/breakReminders");

const MIN = 60 * 1000;
const NOW = Date.parse("2026-11-04T22:00:00Z"); // 4:00 PM Chicago (CST)
const TZ = "America/Chicago";
const ts = (ms) => ({ toMillis: () => ms });

test("server alert row keeps title, message and reason; falls back for missing fields", () => {
  const row = v.serverAlertRow(
    "maxHours-in1",
    { alertType: "maxHours", title: "Max hours", message: "You have worked 8.5 hours this shift.", reason: "Your company warns after 8 hours in one shift.", createdAt: ts(NOW - MIN) },
    NOW
  );
  assert.deepEqual(row, {
    id: "server:maxHours-in1",
    source: "server",
    alertType: "maxHours",
    title: "Max hours",
    message: "You have worked 8.5 hours this shift.",
    reason: "Your company warns after 8 hours in one shift.",
    atMs: NOW - MIN,
  });
  const bare = v.serverAlertRow("x", { alertType: "stillClockedIn", createdAt: null }, NOW);
  assert.equal(bare.title, "Still clocked in");
  assert.equal(bare.atMs, NOW); // server time not back yet
  assert.equal(v.serverAlertRow("y", {}, NOW).title, "Alert");
});

test("merged with fired break reminders, newest first", () => {
  const start = NOW - 30 * MIN;
  const log = r.addScheduled([], r.breakReminderPlan({ breakStartMs: start, breaks: {}, nowMs: start }), start);
  const reminders = r.firedReminders(log, NOW).map(v.reminderRow);
  const server = [
    v.serverAlertRow("a", { alertType: "shiftEnding", title: "Shift ending soon", createdAt: ts(NOW - 5 * MIN) }, NOW),
    v.serverAlertRow("b", { alertType: "overtime", title: "Overtime", createdAt: ts(NOW - 60 * MIN) }, NOW),
  ];
  const rows = v.mergeAlerts(server, reminders);
  assert.deepEqual(
    rows.map((x) => x.title),
    ["Shift ending soon", "Break over limit", "Break time is up", "5 minutes left", "Overtime"]
  );
  assert.equal(rows[1].source, "phone");
  assert.match(rows[1].reason, /break limit/);
});

test("at most 50 rows; rows with no time are dropped", () => {
  const many = Array.from({ length: 70 }, (_, i) => v.serverAlertRow(`s${i}`, { createdAt: ts(NOW - i * MIN) }, NOW));
  const rows = v.mergeAlerts(many, [{ id: "bad", atMs: "x" }]);
  assert.equal(rows.length, v.ALERTS_TAB_LIMIT);
  assert.equal(rows[0].id, "server:s0");
  assert.deepEqual(v.mergeAlerts(null, undefined), []);
});

test("time label: time only today, date + time on another day (company time zone)", () => {
  assert.equal(v.alertTimeLabel(NOW - 30 * MIN, NOW, TZ), "3:30 PM");
  assert.equal(v.alertTimeLabel(NOW - 24 * 60 * MIN, NOW, TZ), "Nov 3, 4:00 PM");
  // 11:30 PM Chicago on Nov 3 = 05:30 UTC Nov 4: still "yesterday" in Chicago.
  assert.equal(v.alertTimeLabel(Date.parse("2026-11-04T05:30:00Z"), NOW, TZ), "Nov 3, 11:30 PM");
});

test("no face found in a punch photo (2026-11-06): its own Alerts tab row with the server's text", () => {
  const data = {
    alertType: "faceNoFace",
    title: "Couldn't detect a face",
    message: "Couldn't detect a face in your clock-in photo at 9:14 AM - please take a better picture next time.",
    reason: "Your company checks each clock photo for your face. Your punch was still saved.",
    createdAt: ts(NOW - MIN),
  };
  const row = v.serverAlertRow("faceNoFace-evt1", data, NOW);
  assert.equal(row.alertType, "faceNoFace");
  assert.equal(row.title, "Couldn't detect a face");
  assert.match(row.message, /please take a better picture/);
  assert.equal(v.serverAlertRow("faceNoFace-evt2", { alertType: "faceNoFace", createdAt: null }, NOW).title, "Couldn't detect a face", "title fallback");
});
