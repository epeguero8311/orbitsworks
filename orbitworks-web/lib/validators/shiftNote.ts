import { z } from "zod";

// An employee's comment on one of their own shifts (Employee App). Mirrors
// the bounds firestore.rules enforces on shiftNotes creates by the
// "employee" role, and orbitworks-app/lib/validators/shiftComment.js (same
// limits, same messages) - keep all three in sync by hand.
// test/shiftNoteParity.test.mjs runs one case table through both validators.
export const SHIFT_NOTE_MAX_LENGTH = 1000;

export const SHIFT_NOTE_ERRORS = {
  noteRequired: "Note is required",
  noteTooLong: `Note must be ${SHIFT_NOTE_MAX_LENGTH} characters or fewer`,
  shiftRequired: "Shift is required",
  badTime: "Comment time is invalid",
} as const;

export const employeeShiftNoteSchema = z.object({
  note: z
    .string({ error: SHIFT_NOTE_ERRORS.noteRequired })
    .trim()
    .min(1, SHIFT_NOTE_ERRORS.noteRequired)
    .max(SHIFT_NOTE_MAX_LENGTH, SHIFT_NOTE_ERRORS.noteTooLong),
  // The shift's clock-in event id.
  clockEventId: z.string({ error: SHIFT_NOTE_ERRORS.shiftRequired }).trim().min(1, SHIFT_NOTE_ERRORS.shiftRequired),
  // When the employee typed it, by the phone's clock (millis). Optional:
  // supervisor/admin notes never have it.
  madeAtMs: z
    .number({ error: SHIFT_NOTE_ERRORS.badTime })
    .int(SHIFT_NOTE_ERRORS.badTime)
    .positive(SHIFT_NOTE_ERRORS.badTime)
    .optional(),
});

export type EmployeeShiftNoteInput = z.infer<typeof employeeShiftNoteSchema>;
