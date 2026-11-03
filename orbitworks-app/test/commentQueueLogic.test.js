// Employee App Phase 5 - offline shift comment queue rules
// (lib/commentQueueLogic.js): when a comment may be sent, send order, error
// sorting, the comment time clamp, the doc it writes and cleanup.
// Run: node --test test/commentQueueLogic.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../lib/commentQueueLogic");
const { SYNCED_KEEP_MS } = require("../lib/punchQueueLogic");

const CO = "co1";
const E = "emp1";
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-03T15:00:00Z");

let seq = 0;
function comment(fields) {
  seq += 1;
  return {
    requestId: `c${seq}`,
    companyId: CO,
    employeeId: E,
    clockEventId: "in1",
    note: "Left early",
    madeAtMs: NOW - HOUR,
    createdByName: "Ana",
    status: "waiting",
    failReason: null,
    failMessage: "",
    attempts: 0,
    createdAt: NOW - HOUR,
    syncedAt: null,
    ...fields,
  };
}
function punch(fields) {
  return { requestId: "in1", companyId: CO, employeeId: E, action: "in", status: "synced", failKind: null, ...fields };
}
const ts = (ms) => ({ toMillis: () => ms });

// ---- when a comment may be sent ----

test("gate: clock-in synced, or not on the phone at all -> send", () => {
  assert.equal(c.commentGate(comment(), [punch({ status: "synced" })]), "send");
  assert.equal(c.commentGate(comment(), []), "send");
  assert.equal(c.commentGate(comment(), [punch({ requestId: "other", status: "waiting" })]), "send");
});

test("gate: clock-in still waiting or syncing -> wait", () => {
  assert.equal(c.commentGate(comment(), [punch({ status: "waiting" })]), "wait");
  assert.equal(c.commentGate(comment(), [punch({ status: "syncing" })]), "wait");
});

test("gate: clock-in needs Redo (wrong PIN) -> wait, it can still sync", () => {
  assert.equal(c.commentGate(comment(), [punch({ status: "failed", failKind: "redo" })]), "wait");
});

test("gate: clock-in failed for good -> fail (Not synced)", () => {
  assert.equal(c.commentGate(comment(), [punch({ status: "failed", failKind: "notRecorded" })]), "fail");
  assert.equal(c.commentGate(comment(), [punch({ status: "failed", failKind: "couldntSync" })]), "fail");
});

// ---- send order ----

test("to send: this employee's waiting comments, oldest first, waiting-on-clock-in skipped", () => {
  const a = comment({ madeAtMs: NOW - 30 * MIN, clockEventId: "in1" });
  const b = comment({ madeAtMs: NOW - 50 * MIN, clockEventId: "in1" });
  const waitingOnPunch = comment({ madeAtMs: NOW - 60 * MIN, clockEventId: "in2" });
  const other = comment({ employeeId: "emp2" });
  const otherCo = comment({ companyId: "co2" });
  const synced = comment({ status: "synced" });
  const failed = comment({ status: "failed" });
  const punches = [punch({ requestId: "in1" }), punch({ requestId: "in2", status: "waiting" })];
  const out = c.commentsToSend([a, b, waitingOnPunch, other, otherCo, synced, failed], punches, CO, E);
  assert.deepEqual(
    out.map((x) => [x.comment.requestId, x.gate]),
    [
      [b.requestId, "send"],
      [a.requestId, "send"],
    ]
  );
});

test("to send: a comment whose clock-in failed for good comes back as fail, the rest still send", () => {
  const dead = comment({ madeAtMs: NOW - 50 * MIN, clockEventId: "inDead" });
  const ok = comment({ madeAtMs: NOW - 40 * MIN, clockEventId: "in1" });
  const punches = [punch({ requestId: "in1" }), punch({ requestId: "inDead", status: "failed", failKind: "notRecorded" })];
  const out = c.commentsToSend([ok, dead], punches, CO, E);
  assert.deepEqual(
    out.map((x) => [x.comment.requestId, x.gate]),
    [
      [dead.requestId, "fail"],
      [ok.requestId, "send"],
    ]
  );
});

test("to send: a paused punch queue doesn't hold back a comment on a synced shift", () => {
  const ok = comment({ clockEventId: "in1" });
  const punches = [punch({ requestId: "in1" }), punch({ requestId: "out9", action: "out", status: "failed", failKind: "couldntSync" })];
  assert.equal(c.commentsToSend([ok], punches, CO, E).length, 1);
});

// ---- error sorting ----

test("errors: rule refusals -> refused (then the app checks if the comment is already there)", () => {
  for (const code of ["permission-denied", "firestore/permission-denied", "invalid-argument", "failed-precondition", "not-found", "already-exists"]) {
    assert.equal(c.commentErrorKind({ code }), "refused", code);
  }
});

test("errors: signal, timeout, server hiccups, sign-in refresh -> retry", () => {
  for (const code of ["timeout", "unavailable", "deadline-exceeded", "internal", "unknown", "aborted", "unauthenticated", "resource-exhausted"]) {
    assert.equal(c.commentErrorKind({ code }), "retry", code);
  }
  assert.equal(c.commentErrorKind(new Error("Network request failed")), "retry");
  assert.equal(c.commentErrorKind(null), "retry");
});

// ---- comment time ----

test("time: a comment typed after the clock-in keeps its own time", () => {
  assert.equal(c.clampMadeAtMs(NOW - 10 * MIN, { timestamp: ts(NOW - HOUR) }), NOW - 10 * MIN);
});

test("time: phone clock behind the server's clock-in time -> raised to the clock-in time", () => {
  assert.equal(c.clampMadeAtMs(NOW - 2 * HOUR, { timestamp: ts(NOW - HOUR) }), NOW - HOUR);
});

test("time: uses the EARLIEST of timestamp, adjustedTimestamp and queuedAtMs (same as the rule)", () => {
  // Admin moved the clock-in later than the comment: the original time counts.
  assert.equal(c.clampMadeAtMs(NOW - 50 * MIN, { timestamp: ts(NOW - HOUR), adjustedTimestamp: ts(NOW - 30 * MIN) }), NOW - 50 * MIN);
  // Admin moved it earlier: the earlier time counts.
  assert.equal(c.clampMadeAtMs(NOW - 3 * HOUR, { timestamp: ts(NOW - HOUR), adjustedTimestamp: ts(NOW - 2 * HOUR) }), NOW - 2 * HOUR);
  // queuedAtMs on the clock-in (millis).
  assert.equal(c.clampMadeAtMs(NOW - 3 * HOUR, { timestamp: ts(NOW - HOUR), queuedAtMs: NOW - 90 * MIN }), NOW - 90 * MIN);
});

test("time: fractional millis round up so the rule's whole-number check passes", () => {
  const out = c.clampMadeAtMs(1000, { timestamp: ts(1500.4) });
  assert.equal(out, 1501);
  assert.ok(Number.isSafeInteger(out));
  assert.equal(c.clampMadeAtMs(2000.6, { timestamp: ts(1000) }), 2001);
});

test("time: no comment time -> none sent; clock-in with no usable time -> unchanged", () => {
  assert.equal(c.clampMadeAtMs(undefined, { timestamp: ts(NOW) }), undefined);
  assert.equal(c.clampMadeAtMs(NaN, { timestamp: ts(NOW) }), undefined);
  assert.equal(c.clampMadeAtMs(NOW - HOUR, {}), NOW - HOUR);
  assert.equal(c.clampMadeAtMs(NOW - HOUR, null), NOW - HOUR);
});

// ---- the doc it writes ----

// firestore.rules isValidEmployeeShiftNoteCreate hasOnly list.
const RULE_KEYS = ["note", "siteId", "siteName", "createdByUid", "createdByName", "timestamp", "employeeId", "clockEventId", "source", "madeAtMs"];

test("doc: only fields the rule allows; site comes from the server's clock-in", () => {
  const doc = c.commentDoc(comment({ note: "  Left early  " }), {
    uid: "uid1",
    clockIn: { timestamp: ts(NOW - 2 * HOUR), siteId: "site1", siteName: "Site One" },
  });
  for (const k of Object.keys(doc)) assert.ok(RULE_KEYS.includes(k), k);
  assert.equal(doc.timestamp, undefined, "server time is added by the sender");
  assert.deepEqual(doc, {
    note: "Left early",
    siteId: "site1",
    siteName: "Site One",
    createdByUid: "uid1",
    createdByName: "Ana",
    employeeId: E,
    clockEventId: "in1",
    source: "employeeApp",
    madeAtMs: NOW - HOUR,
  });
});

test("doc: clock-in with no site -> siteId null, siteName empty; no name -> empty", () => {
  const doc = c.commentDoc(comment({ createdByName: null }), { uid: "uid1", clockIn: { timestamp: ts(NOW - 2 * HOUR) } });
  assert.equal(doc.siteId, null);
  assert.equal(doc.siteName, "");
  assert.equal(doc.createdByName, "");
});

test("doc: comment time is clamped; no time -> field left out", () => {
  const raised = c.commentDoc(comment({ madeAtMs: NOW - 3 * HOUR }), { uid: "u", clockIn: { timestamp: ts(NOW - HOUR) } });
  assert.equal(raised.madeAtMs, NOW - HOUR);
  const none = c.commentDoc(comment({ madeAtMs: null }), { uid: "u", clockIn: { timestamp: ts(NOW - HOUR) } });
  assert.equal("madeAtMs" in none, false);
});

test("doc: a bad saved note throws (never sent)", () => {
  assert.throws(() => c.commentDoc(comment({ note: "   " }), { uid: "u", clockIn: {} }), /Note is required/);
  assert.throws(() => c.commentDoc(comment({ note: "x".repeat(1001) }), { uid: "u", clockIn: {} }), /1000/);
});

// ---- saving ----

test("new comment: checked with the shared validator, trimmed, time = now when not given", () => {
  const ok = c.newCommentFields({ note: "  hi ", clockEventId: " in1 ", madeAtMs: NOW }, NOW + 5);
  assert.deepEqual(ok, { note: "hi", clockEventId: "in1", madeAtMs: NOW });
  assert.equal(c.newCommentFields({ note: "hi", clockEventId: "in1" }, NOW).madeAtMs, NOW);
  assert.throws(() => c.newCommentFields({ note: "", clockEventId: "in1" }, NOW), /Note is required/);
  assert.throws(() => c.newCommentFields({ note: "hi", clockEventId: "" }, NOW), /Shift is required/);
});

// ---- cleanup ----

test("cleanup: synced comments drop 4 days after syncing; waiting and Not synced stay", () => {
  const old = comment({ status: "synced", syncedAt: NOW - SYNCED_KEEP_MS });
  const fresh = comment({ status: "synced", syncedAt: NOW - DAY });
  const waiting = comment({ status: "waiting", createdAt: NOW - 30 * DAY });
  const failed = comment({ status: "failed", createdAt: NOW - 30 * DAY });
  assert.deepEqual(c.commentsToDrop([old, fresh, waiting, failed], NOW), [old.requestId]);
});
