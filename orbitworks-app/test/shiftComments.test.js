// Employee App Phase 5 Layer 7b - what the comment screens show: the Home
// Comments button, this shift's comments (server + phone), and comment rows
// on the Sync tab. Run: node --test test/shiftComments.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const home = require("../lib/employeeHome");
const c = require("../lib/commentQueueLogic");
const q = require("../lib/punchQueueLogic");

const TZ = "America/Chicago";
const CO = "co1";
const E = "emp1";
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Wed Nov 4 2026, 3:00 PM in Chicago (CST, UTC-6).
const NOW = Date.parse("2026-11-04T21:00:00Z");

const ev = (id, type, ms) => ({ id, type, timestamp: ms });
let seq = 0;
function comment(fields) {
  seq += 1;
  return {
    requestId: `c${seq}`,
    companyId: CO,
    employeeId: E,
    clockEventId: "in1",
    note: "Gate was locked",
    madeAtMs: NOW - HOUR,
    status: "waiting",
    failMessage: "",
    createdAt: NOW - HOUR,
    syncedAt: null,
    ...fields,
  };
}

test("Home: the open shift's clock-in id; none when clocked out", () => {
  const events = [ev("old-in", "in", NOW - DAY), ev("old-out", "out", NOW - DAY + 8 * HOUR), ev("in1", "in", NOW - 3 * HOUR), ev("b1", "breakStart", NOW - HOUR)];
  assert.equal(home.deriveHomeState(events, NOW, TZ).shiftInId, "in1");
  assert.equal(home.deriveHomeState(events.slice(0, 3), NOW, TZ).shiftInId, "in1");
  assert.equal(home.deriveHomeState(events.slice(0, 2), NOW, TZ).shiftInId, null);
  assert.equal(home.deriveHomeState([], NOW, TZ).shiftInId, null);
  // An open shift with no clock-in in the list (older than what's loaded).
  assert.equal(home.deriveHomeState([ev("b9", "breakStart", NOW - HOUR)], NOW, TZ).shiftInId, null);
});

test("Home: Comments button while clocked in or on break, only with a known clock-in", () => {
  assert.equal(home.showsComments({ status: "in", shiftInId: "in1" }), true);
  assert.equal(home.showsComments({ status: "break", shiftInId: "in1" }), true);
  assert.equal(home.showsComments({ status: "out", shiftInId: null }), false);
  assert.equal(home.showsComments({ status: "done", shiftInId: null }), false);
  assert.equal(home.showsComments({ status: "in", shiftInId: null }), false, "no clock-in to tie it to: hours show");
  assert.equal(home.showsComments(null), false);
  // Clocked out shows the hours, whatever id is around.
  assert.equal(home.showsComments({ status: "out", shiftInId: "in1" }), false);
  assert.equal(home.showsComments({ status: "done", shiftInId: "in1" }), false);
});

test("comments screen: this shift's comments from the server and the phone, newest first, no duplicates", () => {
  const server = [
    { id: "s1", note: "Started late, traffic", madeAtMs: NOW - 3 * HOUR, timestampMs: NOW - 3 * HOUR + 5 * SEC },
    { id: "c-synced", note: "Synced from this phone", madeAtMs: NOW - 2 * HOUR, timestampMs: NOW - 2 * HOUR },
    { id: "s-old", note: "No madeAtMs (older build)", timestampMs: NOW - 4 * HOUR },
  ];
  const queued = [
    comment({ requestId: "c-synced", status: "synced", madeAtMs: NOW - 2 * HOUR }),
    comment({ requestId: "c-wait", status: "waiting", madeAtMs: NOW - 30 * MIN, note: "Typed offline" }),
    comment({ requestId: "c-fail", status: "failed", madeAtMs: NOW - 20 * MIN, note: "Refused" }),
    comment({ requestId: "c-other-shift", clockEventId: "in0", madeAtMs: NOW - 10 * MIN }),
    comment({ requestId: "c-other-emp", employeeId: "emp2", madeAtMs: NOW - 5 * MIN }),
  ];
  const rows = c.shiftCommentRows(server, queued, "in1", CO, E);
  assert.deepEqual(
    rows.map((r) => [r.id, r.tag && r.tag.label]),
    [
      ["c-fail", "Not synced"],
      ["c-wait", "Will sync"],
      ["c-synced", null],
      ["s1", null],
      ["s-old", null],
    ]
  );
  assert.equal(rows[0].note, "Refused");
  assert.equal(rows[0].tag.tone, "red");
  assert.equal(rows[1].tag.tone, "blue");
  assert.equal(rows[3].ms, NOW - 3 * HOUR, "the time it was typed, not the sync time");
  assert.equal(rows[4].ms, NOW - 4 * HOUR, "no madeAtMs: the server time");
  assert.deepEqual(c.shiftCommentRows([], [], "in1", CO, E), []);
  assert.deepEqual(c.shiftCommentRows(server, queued, null, CO, E), []);
});

test("comments screen: a server comment still saving (no time yet) shows on top", () => {
  const rows = c.shiftCommentRows([{ id: "s1", note: "a", madeAtMs: NOW - HOUR, timestampMs: NOW - HOUR }, { id: "s2", note: "b", timestampMs: null }], [], "in1", CO, E);
  assert.deepEqual(rows.map((r) => r.id), ["s2", "s1"]);
});

test("sync tab: comments, same window as punches; unsynced always show", () => {
  const items = [
    comment({ requestId: "w", status: "waiting", madeAtMs: NOW - 5 * DAY }),
    comment({ requestId: "f", status: "failed", madeAtMs: NOW - 6 * DAY }),
    comment({ requestId: "s-new", status: "synced", madeAtMs: NOW - DAY }),
    comment({ requestId: "s-old", status: "synced", madeAtMs: NOW - 3 * DAY }),
    comment({ requestId: "x", employeeId: "emp2" }),
  ];
  assert.deepEqual(c.visibleComments(items, CO, E, NOW, TZ).map((i) => i.requestId), ["s-new", "w", "f"]);
});

test("sync tab: punches and comments in one list, newest first, Comment rows labelled", () => {
  const punches = [
    { requestId: "p1", action: "in", status: "synced", queuedAtMs: NOW - 3 * HOUR },
    { requestId: "p2", action: "breakStart", status: "waiting", queuedAtMs: NOW - HOUR },
  ];
  const comments = [comment({ requestId: "k1", madeAtMs: NOW - 2 * HOUR, note: "  Gate   was\nlocked again, waited for the super to open it  " })];
  const rows = c.syncTabRows(punches, comments);
  assert.deepEqual(rows.map((r) => [r.kind, r.key]), [["punch", "punch-p2"], ["comment", "comment-k1"], ["punch", "punch-p1"]]);
  assert.equal(rows[1].timeMs, NOW - 2 * HOUR);
  assert.equal(rows[1].item.action, "comment");
  assert.equal(q.ACTION_LABELS.comment, "Comment");
  assert.equal(rows[1].detail, "\"Gate was locked again, waited for the su...\"");
  assert.equal(rows[0].detail, null);
});

test("note preview: short notes whole, long ones cut at 40 characters", () => {
  assert.equal(c.notePreview("Left early"), "\"Left early\"");
  assert.equal(c.notePreview("a".repeat(40)), `"${"a".repeat(40)}"`);
  assert.equal(c.notePreview("a".repeat(41)), `"${"a".repeat(40)}..."`);
  assert.equal(c.notePreview(""), "");
});

// The Sync tab badge adds the punch badge and the comment badge, both by
// badgeCount: Not synced always, Waiting / Syncing once 10 s old.
test("sync badge: comments count by the same rule as punches", () => {
  const comments = [
    comment({ status: "failed", createdAt: NOW - SEC }),
    comment({ status: "waiting", createdAt: NOW - 20 * SEC }),
    comment({ status: "waiting", createdAt: NOW - 2 * SEC }),
    comment({ status: "synced", createdAt: NOW - HOUR }),
    comment({ status: "failed", employeeId: "emp2" }),
  ];
  assert.equal(q.badgeCount(comments, CO, E, NOW), 2);
  assert.equal(q.nextBadgeChangeMs(comments, CO, E, NOW), NOW + 8 * SEC);
});
