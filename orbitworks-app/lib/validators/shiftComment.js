// Employee App Phase 5 - checks for a comment on the employee's own shift.
// CommonJS so test/shiftComment.test.js can run it in plain Node.
//
// Mirrors the website's lib/validators/shiftNote.ts (same limits, same
// messages) and firestore.rules (isValidEmployeeShiftNoteCreate) - keep all
// three in sync by hand. The website's test/shiftNoteParity.test.mjs runs
// one case table through both validators.

const SHIFT_NOTE_MAX_LENGTH = 1000;

const SHIFT_NOTE_ERRORS = {
  noteRequired: "Note is required",
  noteTooLong: `Note must be ${SHIFT_NOTE_MAX_LENGTH} characters or fewer`,
  shiftRequired: "Shift is required",
  badTime: "Comment time is invalid",
};

// { note, clockEventId, madeAtMs? } -> { ok, value, error }.
// value has the trimmed note and clockEventId (and madeAtMs when given).
// The first problem found is the error, in the same order as the website.
function validateShiftComment(input) {
  const raw = input || {};
  const fail = (error) => ({ ok: false, value: null, error });

  if (typeof raw.note !== "string") return fail(SHIFT_NOTE_ERRORS.noteRequired);
  const note = raw.note.trim();
  if (note.length < 1) return fail(SHIFT_NOTE_ERRORS.noteRequired);
  if (note.length > SHIFT_NOTE_MAX_LENGTH) return fail(SHIFT_NOTE_ERRORS.noteTooLong);

  if (typeof raw.clockEventId !== "string") return fail(SHIFT_NOTE_ERRORS.shiftRequired);
  const clockEventId = raw.clockEventId.trim();
  if (clockEventId.length < 1) return fail(SHIFT_NOTE_ERRORS.shiftRequired);

  const value = { note, clockEventId };
  if (raw.madeAtMs !== undefined) {
    if (!Number.isSafeInteger(raw.madeAtMs) || raw.madeAtMs <= 0) return fail(SHIFT_NOTE_ERRORS.badTime);
    value.madeAtMs = raw.madeAtMs;
  }
  return { ok: true, value, error: null };
}

module.exports = { SHIFT_NOTE_MAX_LENGTH, SHIFT_NOTE_ERRORS, validateShiftComment };
