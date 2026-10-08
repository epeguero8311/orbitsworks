// Mirrors orbitworks-web/lib/types.ts's MobileAlertType/MobileAlert - kept
// in sync manually since this package can't import across the app/web
// boundary (same convention as isProPlan's duplication comment
// elsewhere in this repo).
export const ALERT_TYPES = [
  "lateClockIn",
  "earlyClockOut",
  "breakTooLong",
  "maxHours",
  "overtime",
  "missedClockOut",
  "clockedInOutsideGeofence",
  "siteMismatch",
  // Face Verification (Pro) - see orbitworks-web/functions/src/rekognition.ts.
  "faceMismatch",
  "faceNoFace",
  "faceBadReference",
  // Update Employee (mobile) - see orbitworks-web/functions/src/alerts.ts.
  "employeeUpdated",
];

export const ALERT_TYPE_LABEL = {
  lateClockIn: "Late Clock-In",
  earlyClockOut: "Early Clock-Out",
  breakTooLong: "Long Break",
  maxHours: "Max Hours",
  overtime: "Overtime",
  missedClockOut: "Missed Clock-Out",
  clockedInOutsideGeofence: "Outside Geofence",
  siteMismatch: "Wrong Site",
  faceMismatch: "Face Mismatch",
  faceNoFace: "No Face Detected",
  faceBadReference: "Bad Reference Photo",
  employeeUpdated: "Employee Updated",
};

// Static fallback only - employeeUpdated's real severity is per-instance
// (set on the alert doc itself, see functions/src/alerts.ts), not looked up
// by type the way every other entry here is.
export const ALERT_SEVERITY = {
  maxHours: "urgent",
  missedClockOut: "urgent",
  overtime: "warning",
  breakTooLong: "warning",
  lateClockIn: "warning",
  earlyClockOut: "warning",
  clockedInOutsideGeofence: "warning",
  siteMismatch: "info",
  faceMismatch: "warning",
  faceNoFace: "warning",
  faceBadReference: "warning",
  employeeUpdated: "warning",
};
