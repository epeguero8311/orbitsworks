// Phase 5: the website's lib/validators/shiftNote.ts and the app's
// orbitworks-app/lib/validators/shiftComment.js must agree on every case
// (same ok/fail, same first message, same cleaned value).
// Plain Node, no emulator. Node 24+ loads the .ts file directly.
// Run via: node --test test/shiftNoteParity.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { employeeShiftNoteSchema, SHIFT_NOTE_MAX_LENGTH, SHIFT_NOTE_ERRORS } from "../lib/validators/shiftNote.ts";

const require = createRequire(import.meta.url);
const app = require("../../orbitworks-app/lib/validators/shiftComment.js");

function web(input) {
  const r = employeeShiftNoteSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data, error: null };
  return { ok: false, value: null, error: r.error.issues[0].message };
}

const base = { note: "Left early for a doctor visit", clockEventId: "evt-1" };
const long = "x".repeat(SHIFT_NOTE_MAX_LENGTH);

const CASES = [
  ["valid, no time", base, true],
  ["valid, with time", { ...base, madeAtMs: 1762000000000 }, true],
  ["trimmed note and id", { note: "  hi  ", clockEventId: " evt-1 " }, true],
  ["note exactly max", { ...base, note: long }, true],
  ["note max plus spaces", { ...base, note: ` ${long} ` }, true],
  ["madeAtMs 1", { ...base, madeAtMs: 1 }, true],
  ["note missing", { clockEventId: "evt-1" }, false],
  ["note not a string", { ...base, note: 5 }, false],
  ["note blank", { ...base, note: "   " }, false],
  ["note too long", { ...base, note: `${long}x` }, false],
  ["id missing", { note: "hi" }, false],
  ["id blank", { note: "hi", clockEventId: "  " }, false],
  ["id not a string", { note: "hi", clockEventId: 7 }, false],
  ["time 0", { ...base, madeAtMs: 0 }, false],
  ["time negative", { ...base, madeAtMs: -1 }, false],
  ["time fraction", { ...base, madeAtMs: 1.5 }, false],
  ["time NaN", { ...base, madeAtMs: NaN }, false],
  ["time Infinity", { ...base, madeAtMs: Infinity }, false],
  ["time string", { ...base, madeAtMs: "1762000000000" }, false],
  ["time null", { ...base, madeAtMs: null }, false],
  ["time unsafe", { ...base, madeAtMs: Number.MAX_SAFE_INTEGER + 1 }, false],
  ["all bad", { note: "", clockEventId: "", madeAtMs: -1 }, false],
  ["note ok, rest bad", { note: "hi", clockEventId: "", madeAtMs: -1 }, false],
];

test("same limits and messages on both sides", () => {
  assert.equal(app.SHIFT_NOTE_MAX_LENGTH, SHIFT_NOTE_MAX_LENGTH);
  assert.deepEqual(app.SHIFT_NOTE_ERRORS, SHIFT_NOTE_ERRORS);
});

for (const [name, input, expectOk] of CASES) {
  test(`parity: ${name}`, () => {
    const w = web(input);
    const a = app.validateShiftComment(input);
    assert.equal(w.ok, expectOk, `website ok for ${name}`);
    assert.deepEqual(a, w);
  });
}
