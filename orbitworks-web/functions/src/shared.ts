import * as admin from "firebase-admin";

admin.initializeApp();
export const db = admin.firestore();

export const FREE_EMPLOYEE_CAP = 8;

// Same bound as overrideReasonSchema (lib/validators/overrideReason.ts) and
// OverrideReasonScreen.js's MIN_LENGTH/MAX_LENGTH - kept in sync manually
// since this package can't import across the app/web boundary. firestore.rules
// enforces this same bound at write time, so this is a belt-and-suspenders
// check rather than the only line of defense.
export const OVERRIDE_REASON_MIN_LENGTH = 10;
export const OVERRIDE_REASON_MAX_LENGTH = 500;

// Matches the timezone autoClockOutStaleSessions already uses for its
// schedule. Cloud Functions' runtime clock reads in UTC by default, so
// computing a "which calendar day is this" date key with raw
// Date.getFullYear()/getMonth()/getDate() silently shifts any evening
// event (e.g. after ~7 PM Central) onto the next day once UTC crosses
// midnight. That mismatch broke timesheetApprovals lookups: a session
// added for "today" could get stamped with tomorrow's date, so it never
// showed up (or couldn't be approved) on the day the admin actually
// picked. This helper fixes the day boundary to a real timezone instead
// of the server's own clock.
export const COMPANY_TIMEZONE = "America/Chicago";

export function localDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

export async function deactivateEmployeeAuth(linkedUserId: string) {
  await admin.auth().updateUser(linkedUserId, { disabled: true });
  await admin.auth().revokeRefreshTokens(linkedUserId);
}
