import * as admin from "firebase-admin";

admin.initializeApp();
export const db = admin.firestore();

export const FREE_EMPLOYEE_CAP = 8;

// Shared by every path that creates an employee doc or flips one active
// (addEmployee, createEmployee, setEmployeeActive, acceptInvite's fresh-invite
// branch) so the active-cap and total-cap comparisons can't drift between
// them. totalEmployeeCount/totalEmployeeCap cover ALL employee docs that
// currently exist (active + inactive) - permanently deleting one (deleteEmployee)
// frees a slot, deactivating does not. null caps (free plan, and every legacy
// tier from before this field existed) mean "no limit."
export type EmployeeCapFields = {
  employeeCap?: number | null;
  activeEmployeeCount?: number;
  totalEmployeeCap?: number | null;
  totalEmployeeCount?: number;
};

export function isOverActiveCap(company: EmployeeCapFields | undefined): boolean {
  const cap = company?.employeeCap ?? null;
  const count = company?.activeEmployeeCount ?? 0;
  return cap !== null && count >= cap;
}

export function isOverTotalCap(company: EmployeeCapFields | undefined): boolean {
  const cap = company?.totalEmployeeCap ?? null;
  const count = company?.totalEmployeeCount ?? 0;
  return cap !== null && count >= cap;
}

// Same bound as overrideReasonSchema (lib/validators/overrideReason.ts) and
// OverrideReasonScreen.js's MIN_LENGTH/MAX_LENGTH - kept in sync manually
// since this package can't import across the app/web boundary. firestore.rules
// enforces this same bound at write time, so this is a belt-and-suspenders
// check rather than the only line of defense.
export const OVERRIDE_REASON_MIN_LENGTH = 10;
export const OVERRIDE_REASON_MAX_LENGTH = 500;

// Cloud Functions' runtime clock reads in UTC by default, so
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

// Same timezone reasoning as localDateKey, for time-of-day instead of
// calendar-day comparisons (e.g. "is this clock-in after business hours
// open?") - raw Date.getHours() reads the function runtime's clock
// (UTC), not the company's local time.
export function localMinutesOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return h * 60 + m;
}

export async function deactivateEmployeeAuth(linkedUserId: string) {
  await admin.auth().updateUser(linkedUserId, { disabled: true });
  await admin.auth().revokeRefreshTokens(linkedUserId);
}

// Deactivating or deleting an employee (setEmployeeActive,
// deactivateEmployeesBulk, deleteEmployee) must never leave a clock
// session dangling open - that
// day's hours would never get paid and Missed Clock Out alerts would fire
// forever with no way to resolve them. This runs inline in the same
// request that flips active, right after that write, rather than as a
// separate scheduled job - closing the gap the moment it opens instead of
// hoping a nightly sweep catches it. Finds the employee's latest clock
// event (regardless of how old it is - a stale session could be days old)
// and, if it isn't already "out", writes a closing "out" (and a
// "breakEnd" first if they were left on break) stamped with the
// deactivation moment. isActiveOrClosingOpenSession in firestore.rules
// is what lets these same event types still be written client-side for an
// already-inactive employee (the manual/alert/mobile clock-out surfaces)
// as a safety net if this write itself fails.
export async function closeOpenSessionForDeactivation(
  companyId: string,
  employeeId: string,
  deactivatedByUid: string
): Promise<void> {
  const eventsRef = db.collection("companies").doc(companyId).collection("clockEvents");
  const latestSnap = await eventsRef
    .where("employeeId", "==", employeeId)
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();
  if (latestSnap.empty) return;

  const latest = latestSnap.docs[0].data() as {
    type?: string;
    siteId?: string | null;
    siteName?: string;
    employeeName?: string;
    subcontractorId?: string | null;
    subcontractorName?: string | null;
  };
  if (!latest.type || latest.type === "out") return;

  const now = admin.firestore.Timestamp.now();
  const base = {
    employeeId,
    employeeName: latest.employeeName ?? "",
    siteId: latest.siteId ?? null,
    siteName: latest.siteName ?? "",
    subcontractorId: latest.subcontractorId ?? null,
    subcontractorName: latest.subcontractorName ?? null,
    createdByUid: deactivatedByUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  if (latest.type === "breakStart") {
    batch.set(eventsRef.doc(), {
      ...base,
      type: "breakEnd",
      source: "employeeDeactivated",
      timestamp: now,
    });
  }
  batch.set(eventsRef.doc(), {
    ...base,
    type: "out",
    source: "employeeDeactivated",
    note: "Automatically clocked out - employee was deactivated",
    timestamp: now,
  });
  await batch.commit();
}
