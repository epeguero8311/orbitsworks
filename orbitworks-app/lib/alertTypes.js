// Mirrors orbitworks-web/lib/types.ts's MobileAlertType/MobileAlert - kept
// in sync manually since this package can't import across the app/web
// boundary (same convention as isProPlan's duplication comment
// elsewhere in this repo). Launch set only: outside-geofence and
// site-mismatch need geofence data that doesn't exist on main yet.
export const ALERT_TYPES = [
  "lateClockIn",
  "earlyClockOut",
  "breakTooLong",
  "maxHours",
  "overtime",
  "missedClockOut",
];

export const ALERT_TYPE_LABEL = {
  lateClockIn: "Late Clock-In",
  earlyClockOut: "Early Clock-Out",
  breakTooLong: "Long Break",
  maxHours: "Max Hours",
  overtime: "Overtime",
  missedClockOut: "Missed Clock-Out",
};

export const ALERT_SEVERITY = {
  maxHours: "urgent",
  missedClockOut: "urgent",
  overtime: "warning",
  breakTooLong: "warning",
  lateClockIn: "warning",
  earlyClockOut: "warning",
};
