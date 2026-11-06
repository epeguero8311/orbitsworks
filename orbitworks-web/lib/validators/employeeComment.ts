import { z } from "zod";

// The employee's optional comment on one clock-in or clock-out
// (ClockEvent.employeeComment). Mirrors orbitworks-app/lib/validators/
// employeeComment.js and firestore.rules' isValidEmployeeComment - keep all
// three in sync by hand (no shared package across the app/web boundary).
// The website never writes this field; the schema documents the bounds and
// backs test/employeeComment.test.mjs.
export const EMPLOYEE_COMMENT_MAX_LENGTH = 500;

export const employeeCommentSchema = z
  .string()
  .trim()
  .min(1, "Comment is empty")
  .max(EMPLOYEE_COMMENT_MAX_LENGTH, `Comment must be ${EMPLOYEE_COMMENT_MAX_LENGTH} characters or fewer`);
