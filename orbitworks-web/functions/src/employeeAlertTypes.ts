import type { Timestamp } from "firebase-admin/firestore";

// ---- Employee App Phase 7: the employee's own alerts + push token ----
//
// Mirrors orbitworks-web/lib/types.ts (EmployeeAlert, EmployeeAlertType) -
// this package can't import across the web boundary, keep both in sync.

// Server-sent employee alerts. Break warnings (5 min left, time up, over
// limit) are local notifications on the phone and never come from here.
//   shiftEnding    - 15 min before business close, shift started before close
//   stillClockedIn - business close + the "Missed clock out alert" delay
//   maxHours       - this shift passed the company's max hours
//   overtime       - this week passed the company's overtime threshold
export const EMPLOYEE_ALERT_TYPES = ["shiftEnding", "stillClockedIn", "maxHours", "overtime"] as const;
export type EmployeeAlertType = (typeof EMPLOYEE_ALERT_TYPES)[number];

// companies/{companyId}/employeeAlerts/{alertId} - one per underlying
// condition (deterministic id, written with create()). Server-written only;
// the employee reads only their own (firestore.rules). Deleted after
// EMPLOYEE_ALERT_RETENTION_DAYS by cleanupEmployeeAlerts.
export interface EmployeeAlertDoc {
  employeeId: string;
  alertType: EmployeeAlertType;
  title: string;
  message: string;
  reason: string; // why it fired, in plain words
  shiftId: string | null; // clock-in event id of the related shift
  createdAt: Timestamp;
}

export const EMPLOYEE_ALERT_RETENTION_DAYS = 90;

// companies/{companyId}/employeePushTokens/{employeeId} - the Expo push
// token of the phone the employee last signed in on (latest phone wins).
// Server-only: no client read or write (firestore.rules). Written by
// registerEmployeePushToken, removed by clearEmployeePushToken or when Expo
// says the token is no longer registered.
export interface EmployeePushTokenDoc {
  employeeId: string;
  token: string;
  platform: "ios" | "android";
  updatedAt: Timestamp;
}
