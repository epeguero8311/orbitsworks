const test = require("node:test");
const assert = require("node:assert/strict");
const { validateShiftComment, SHIFT_NOTE_MAX_LENGTH, SHIFT_NOTE_ERRORS: E } = require("../lib/validators/shiftComment");

const base = { note: "Left early for a doctor visit", clockEventId: "evt-1" };

test("valid comment: note and clockEventId trimmed, madeAtMs optional", () => {
  const r = validateShiftComment({ note: "  hi  ", clockEventId: " evt-1 " });
  assert.deepEqual(r, { ok: true, value: { note: "hi", clockEventId: "evt-1" }, error: null });
  const t = validateShiftComment({ ...base, madeAtMs: 1762000000000 });
  assert.equal(t.ok, true);
  assert.equal(t.value.madeAtMs, 1762000000000);
});

test("note: required, not blank, at most 1000 after trimming", () => {
  assert.equal(validateShiftComment({ clockEventId: "evt-1" }).error, E.noteRequired);
  assert.equal(validateShiftComment({ ...base, note: 5 }).error, E.noteRequired);
  assert.equal(validateShiftComment({ ...base, note: "   " }).error, E.noteRequired);
  assert.equal(validateShiftComment({ ...base, note: "x".repeat(SHIFT_NOTE_MAX_LENGTH) }).ok, true);
  assert.equal(validateShiftComment({ ...base, note: ` ${"x".repeat(SHIFT_NOTE_MAX_LENGTH)} ` }).ok, true);
  assert.equal(validateShiftComment({ ...base, note: "x".repeat(SHIFT_NOTE_MAX_LENGTH + 1) }).error, E.noteTooLong);
});

test("clockEventId: required, not blank", () => {
  assert.equal(validateShiftComment({ note: "hi" }).error, E.shiftRequired);
  assert.equal(validateShiftComment({ note: "hi", clockEventId: "  " }).error, E.shiftRequired);
  assert.equal(validateShiftComment({ note: "hi", clockEventId: 7 }).error, E.shiftRequired);
});

test("madeAtMs: when given, a positive whole number", () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity, "1762000000000", null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validateShiftComment({ ...base, madeAtMs: bad }).error, E.badTime, `madeAtMs ${String(bad)}`);
  }
  assert.equal(validateShiftComment({ ...base, madeAtMs: 1 }).ok, true);
});

test("first problem wins: note before shift before time", () => {
  assert.equal(validateShiftComment({ note: "", clockEventId: "", madeAtMs: -1 }).error, E.noteRequired);
  assert.equal(validateShiftComment({ note: "hi", clockEventId: "", madeAtMs: -1 }).error, E.shiftRequired);
  assert.equal(validateShiftComment(undefined).error, E.noteRequired);
});
