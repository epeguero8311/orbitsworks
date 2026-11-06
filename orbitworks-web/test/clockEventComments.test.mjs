// Employee comments on clock events - pure helpers + app/web validator
// parity. No Firebase, no emulator. Run from orbitworks-web:
//   node --test test/clockEventComments.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { eventComment, sessionComments, commentEventLabel } from "../lib/clockEventComments.ts";
import { EMPLOYEE_COMMENT_MAX_LENGTH, employeeCommentSchema } from "../lib/validators/employeeComment.ts";
import * as app from "../../orbitworks-app/lib/validators/employeeComment.js";

const ts = (ms) => ({ toMillis: () => ms });
const IN_MS = Date.UTC(2026, 10, 5, 13, 12);
const OUT_MS = Date.UTC(2026, 10, 5, 20, 40);

test("each comment stays on its own event type", () => {
  const clockIn = { id: "a", type: "in", employeeComment: "Traffic", timestamp: ts(IN_MS) };
  const clockOut = { id: "b", type: "out", employeeComment: "Doctor", timestamp: ts(OUT_MS) };
  assert.deepEqual(sessionComments(clockIn, clockOut), [
    { eventId: "a", eventType: "in", text: "Traffic", timeMs: IN_MS },
    { eventId: "b", eventType: "out", text: "Doctor", timeMs: OUT_MS },
  ]);
});

test("a clock-in comment never shows under the clock-out (and vice versa)", () => {
  const inOnly = sessionComments({ id: "a", type: "in", employeeComment: "Late bus", timestamp: ts(IN_MS) }, { id: "b", type: "out", timestamp: ts(OUT_MS) });
  assert.equal(inOnly.length, 1);
  assert.equal(inOnly[0].eventType, "in");
  const outOnly = sessionComments({ id: "a", type: "in", timestamp: ts(IN_MS) }, { id: "b", type: "out", employeeComment: "Sick", timestamp: ts(OUT_MS) });
  assert.equal(outOnly.length, 1);
  assert.equal(outOnly[0].eventType, "out");
});

test("old events with no field, blank text and break events give no comment", () => {
  assert.equal(eventComment({ id: "x", type: "in", timestamp: ts(IN_MS) }), null);
  assert.equal(eventComment({ id: "x", type: "out", employeeComment: "   ", timestamp: ts(IN_MS) }), null);
  assert.equal(eventComment({ id: "x", type: "breakStart", employeeComment: "lunch", timestamp: ts(IN_MS) }), null);
  assert.equal(eventComment(null), null);
});

test("missing timestamp gives timeMs null; labels", () => {
  assert.equal(eventComment({ id: "x", type: "in", employeeComment: "hi" }).timeMs, null);
  assert.equal(commentEventLabel("in"), "Clock in");
  assert.equal(commentEventLabel("out"), "Clock out");
});

test("app and web validators share the 500-char limit", () => {
  assert.equal(EMPLOYEE_COMMENT_MAX_LENGTH, 500);
  assert.equal(app.EMPLOYEE_COMMENT_MAX_LENGTH, EMPLOYEE_COMMENT_MAX_LENGTH);
  for (const [text, ok] of [["a".repeat(500), true], ["a".repeat(501), false], ["  late  ", true]]) {
    assert.equal(employeeCommentSchema.safeParse(text).success, ok, `web ${text.length}`);
    assert.equal(app.validateEmployeeComment(text).valid, ok, `app ${text.length}`);
  }
});

test("app cleanEmployeeComment: trims, empty = null, never over the limit", () => {
  assert.equal(app.cleanEmployeeComment("  Gate locked  "), "Gate locked");
  assert.equal(app.cleanEmployeeComment("   "), null);
  assert.equal(app.cleanEmployeeComment(undefined), null);
  assert.equal(app.cleanEmployeeComment(42), null);
  assert.equal(app.cleanEmployeeComment("a".repeat(900)).length, 500);
});
