export const EMPLOYEE_COMMENT_MAX_LENGTH = 500;

// The employee's optional comment on one clock-in or clock-out, typed on
// the camera screen. Mirrors orbitworks-web/lib/validators/employeeComment.ts
// and firestore.rules (isValidEmployeeComment) - keep all three in sync by
// hand, same convention as device.js.
export function validateEmployeeComment(text) {
  const trimmed = (text ?? "").trim();
  if (trimmed.length > EMPLOYEE_COMMENT_MAX_LENGTH) {
    return {
      valid: false,
      trimmed,
      error: `Comment must be ${EMPLOYEE_COMMENT_MAX_LENGTH} characters or fewer`,
    };
  }
  return { valid: true, trimmed, error: null };
}

// What actually gets stored and sent: the trimmed text, or null when
// there's no comment. Never throws and never returns anything the rules
// would refuse - a too-long value (only possible from a corrupted row) is
// cut to the limit, because a bad comment must never block the clock
// event it rides on.
export function cleanEmployeeComment(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, EMPLOYEE_COMMENT_MAX_LENGTH);
}
