// Phase 5 Layer 7d - employee comments on the website (lib/shiftComments.ts):
// which clock-ins to look up, the Firestore "in" batches, and the comments
// shown in a clock-in row's Note cell.
// Plain Node, no emulator. Node 24+ loads the .ts file directly.
// Run via: node --test test/shiftComments.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMENT_IDS_PER_QUERY,
  clockInIds,
  chunkIds,
  commentTimeMs,
  groupCommentsByClockIn,
  commentsForEvent,
} from "../lib/shiftComments.ts";

const ts = (ms) => ({ toMillis: () => ms });
const note = (id, clockEventId, fields = {}) => ({
  id,
  note: `note ${id}`,
  siteId: null,
  siteName: "",
  createdByUid: "u1",
  createdByName: "Ana",
  employeeId: "ana",
  clockEventId,
  source: "employeeApp",
  ...fields,
});

test("ids: clock-ins only, each once, sorted (a stable query key)", () => {
  const events = [
    { id: "b", type: "in" },
    { id: "x", type: "out" },
    { id: "a", type: "in" },
    { id: "y", type: "breakStart" },
    { id: "b", type: "in" },
  ];
  assert.deepEqual(clockInIds(events), ["a", "b"]);
  assert.deepEqual(clockInIds([]), []);
});

test("batches: at most 30 ids per query (Firestore's 'in' limit)", () => {
  assert.equal(COMMENT_IDS_PER_QUERY, 30);
  const ids = Array.from({ length: 65 }, (_, i) => `e${i}`);
  const chunks = chunkIds(ids);
  assert.deepEqual(chunks.map((c) => c.length), [30, 30, 5]);
  assert.deepEqual(chunks.flat(), ids);
  assert.deepEqual(chunkIds([]), []);
  assert.deepEqual(chunkIds(["a", "b", "c"], 2), [["a", "b"], ["c"]]);
});

test("time: when it was typed (madeAtMs), else when it reached the server", () => {
  assert.equal(commentTimeMs(note("1", "in1", { madeAtMs: 100, timestamp: ts(500) })), 100);
  assert.equal(commentTimeMs(note("2", "in1", { timestamp: ts(500) })), 500);
  assert.equal(commentTimeMs(note("3", "in1")), null);
});

test("group: by clock-in, oldest first, no time last; notes with no clock-in skipped", () => {
  const notes = [
    note("late", "in1", { madeAtMs: 300 }),
    note("early", "in1", { madeAtMs: 100, timestamp: ts(900) }),
    note("server-time", "in1", { timestamp: ts(200) }),
    note("no-time", "in1"),
    note("other", "in2", { madeAtMs: 50 }),
    note("supervisor", undefined, { source: undefined, employeeId: undefined, timestamp: ts(10) }),
  ];
  const byIn = groupCommentsByClockIn(notes);
  assert.deepEqual(byIn.get("in1").map((n) => n.id), ["early", "server-time", "late", "no-time"]);
  assert.deepEqual(byIn.get("in2").map((n) => n.id), ["other"]);
  assert.equal(byIn.size, 2, "a supervisor's site note is never tied to a shift");
});

test("row: only the clock-in row shows its shift's comments", () => {
  const byIn = groupCommentsByClockIn([note("c1", "in1", { madeAtMs: 1 })]);
  assert.deepEqual(commentsForEvent(byIn, { id: "in1", type: "in" }).map((n) => n.id), ["c1"]);
  assert.deepEqual(commentsForEvent(byIn, { id: "in1", type: "out" }), []);
  assert.deepEqual(commentsForEvent(byIn, { id: "in9", type: "in" }), []);
  assert.deepEqual(commentsForEvent(byIn, null), []);
});
