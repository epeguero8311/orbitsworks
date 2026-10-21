import { z } from "zod";

// An employee's comment on one of their own shifts (Employee App). Mirrors
// the bounds firestore.rules enforces on shiftNotes creates by the
// "employee" role - keep both in sync.
export const SHIFT_NOTE_MAX_LENGTH = 1000;

export const employeeShiftNoteSchema = z.object({
  note: z.string().trim().min(1, "Note is required").max(SHIFT_NOTE_MAX_LENGTH),
  // The shift's clock-in event id.
  clockEventId: z.string().trim().min(1),
});

export type EmployeeShiftNoteInput = z.infer<typeof employeeShiftNoteSchema>;
