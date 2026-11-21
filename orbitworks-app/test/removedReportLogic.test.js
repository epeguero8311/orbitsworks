// RC1 follow-up - lib/removedReportLogic.js (Remove warning + the report
// the admin's punchRemoved alert comes from).
// Run: node --test test/removedReportLogic.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lib/removedReportLogic");

const T = Date.UTC(2026, 10, 20, 14, 0);
const punch = { requestId: "r1", companyId: "c", employeeId: "e", action: "in", queuedAtMs: T, failMessage: "Your PIN was wrong.", status: "failed" };
const comment = { requestId: "r2", companyId: "c", employeeId: "e", clockEventId: "ev", note: "  Left early  ", madeAtMs: T + 5, failMessage: "", status: "failed" };

test("punch report: what the server needs, no comment fields", () => {
  const row = L.buildRemovedReport("punch", punch, T + 60000.4);
  assert.deepEqual(row, { requestId: "r1", companyId: "c", employeeId: "e", kind: "punch", madeAtMs: T, removedAtMs: T + 60000, failMessage: "Your PIN was wrong.", action: "in", clockEventId: null, note: null });
  assert.deepEqual(L.toReportPayload(row), { requestId: "r1", kind: "punch", madeAtMs: T, removedAtMs: T + 60000, action: "in", failMessage: "Your PIN was wrong." });
});

test("comment report: carries its shift and the lost text (trimmed, capped), no action", () => {
  const row = L.buildRemovedReport("comment", comment, T + 1000);
  assert.equal(row.note, "Left early");
  assert.equal(row.failMessage, null);
  assert.deepEqual(L.toReportPayload(row), { requestId: "r2", kind: "comment", madeAtMs: T + 5, removedAtMs: T + 1000, clockEventId: "ev", note: "Left early" });
  assert.equal(L.buildRemovedReport("comment", { ...comment, note: "x".repeat(1500) }, T).note.length, 1000);
  assert.equal(L.buildRemovedReport("punch", { ...punch, failMessage: "y".repeat(400) }, T).failMessage.length, 300);
});

test("send outcome: only a refused input is final; signal, timeout and permission keep it waiting", () => {
  assert.equal(L.reportSendOutcome({ code: "functions/invalid-argument" }), "refused");
  for (const code of ["functions/unavailable", "functions/deadline-exceeded", "functions/permission-denied", "functions/internal", "timeout"]) {
    assert.equal(L.reportSendOutcome({ code }), "retry", code);
  }
  assert.equal(L.reportSendOutcome(new Error("Network request failed")), "retry");
  assert.equal(L.reportSendOutcome(null), "retry");
});

test("reportsToSend: only this employee's unsent reports, oldest first", () => {
  const rows = [
    { requestId: "b", companyId: "c", employeeId: "e", status: "waiting", createdAt: 2 },
    { requestId: "a", companyId: "c", employeeId: "e", status: "syncing", createdAt: 1 },
    { requestId: "x", companyId: "c", employeeId: "other", status: "waiting", createdAt: 0 },
    { requestId: "y", companyId: "c2", employeeId: "e", status: "waiting", createdAt: 0 },
    { requestId: "z", companyId: "c", employeeId: "e", status: "failed", createdAt: 0 },
  ];
  assert.deepEqual(L.reportsToSend(rows, "c", "e").map((r) => r.requestId), ["a", "b"]);
});

test("warning: says it is lost for good, can't come back, and the admin will be told", () => {
  const p = L.removeWarning("punch", "in", "Today, 9:05 AM");
  assert.equal(p.title, "Lose this clock-in?");
  assert.match(p.message, /^This clock-in from Today, 9:05 AM was never recorded\. If you remove it, it is lost for good/);
  assert.match(p.message, /can't be sent or brought back/);
  assert.match(p.message, /Your admin will be told you removed it/);
  assert.equal(p.confirmLabel, "Remove for good");
  assert.equal(p.cancelLabel, "Keep it");
  assert.equal(L.removeWarning("punch", "breakEnd", "").title, "Lose this break end?");
  assert.equal(L.removeWarning("punch", "weird").title, "Lose this punch?");
  const c = L.removeWarning("comment", null, "Yesterday, 4:10 PM");
  assert.match(c.message, /^This comment from Yesterday, 4:10 PM was never saved\. If you remove it, it is gone for good/);
  assert.match(c.message, /Your admin will be told/);
});
