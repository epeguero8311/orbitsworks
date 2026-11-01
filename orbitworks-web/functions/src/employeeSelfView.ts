import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { db } from "./shared";

// ---- Employee App: safe copy of the employee doc ----
//
// companies/{companyId}/employees/{employeeId} holds the plain-text PIN, so
// Employee App logins can't read it (firestore.rules). This keeps
// companies/{companyId}/employeeSelfViews/{employeeId} in sync with ONLY the
// fields the employee's own app needs. It is an allowlist on purpose: a new
// field on the employee doc never leaks here by accident. NEVER add the PIN,
// hourly rate, dob, email, rate history or face fields.
//
// Re-runs on every employee doc write (admin edits, deactivation, and the
// lastEvent* fields onClockEventCreated writes after every punch). Writes
// that don't change the copied fields are skipped. Deleting the employee
// deletes the view.

type EmployeeData = Record<string, unknown>;

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

const EVENT_TYPES = ["in", "out", "breakStart", "breakEnd"];

// Fixed key order so two projections can be compared with JSON.stringify.
export function buildEmployeeSelfView(employee: EmployeeData) {
  const assigned = Array.isArray(employee.assignedSiteIds)
    ? employee.assignedSiteIds.filter((id): id is string => typeof id === "string")
    : [];
  const lastType = typeof employee.lastEventType === "string" && EVENT_TYPES.includes(employee.lastEventType)
    ? employee.lastEventType
    : null;
  const lastTs = employee.lastEventTimestamp instanceof admin.firestore.Timestamp ? employee.lastEventTimestamp : null;
  return {
    name: typeof employee.name === "string" ? employee.name : "",
    photoUrl: strOrNull(employee.photoUrl),
    active: employee.active === true,
    assignedSiteIds: assigned,
    joinCodeId: strOrNull(employee.joinCodeId),
    subcontractorId: strOrNull(employee.subcontractorId),
    subcontractorName: strOrNull(employee.subcontractorName),
    linkedUserId: strOrNull(employee.linkedUserId),
    lastEventType: lastType,
    lastEventTimestamp: lastTs,
    lastEventSiteId: strOrNull(employee.lastEventSiteId),
    lastEventSiteName: strOrNull(employee.lastEventSiteName),
  };
}

export function selfViewRef(companyId: string, employeeId: string) {
  return db.collection("companies").doc(companyId).collection("employeeSelfViews").doc(employeeId);
}

export async function writeEmployeeSelfView(companyId: string, employeeId: string, employee: EmployeeData): Promise<void> {
  await selfViewRef(companyId, employeeId).set({
    ...buildEmployeeSelfView(employee),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export const syncEmployeeSelfView = onDocumentWritten("companies/{companyId}/employees/{employeeId}", async (event) => {
  const { companyId, employeeId } = event.params;
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();

  // Cheap skip: this write didn't touch any copied field, so skipping it
  // can never leave the view stale.
  if (before && after) {
    const unchanged = JSON.stringify(buildEmployeeSelfView(before)) === JSON.stringify(buildEmployeeSelfView(after));
    if (unchanged) return;
  }

  await syncSelfViewFromEmployeeDoc(companyId, employeeId);
});

// Events can arrive out of order (an employee doc created and then linked a
// few seconds later, with a cold start in between, delivered the older
// "create" event last and left the view unlinked). So the view is never
// built from the event's own snapshot: it is rebuilt from the employee doc
// as it is now, in a transaction, so a write that lands meanwhile can't be
// overwritten with older data. No employee doc = no view.
export async function syncSelfViewFromEmployeeDoc(companyId: string, employeeId: string): Promise<void> {
  const employeeRef = db.collection("companies").doc(companyId).collection("employees").doc(employeeId);
  const viewRef = selfViewRef(companyId, employeeId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(employeeRef);
    if (!snap.exists) {
      tx.delete(viewRef);
      return;
    }
    tx.set(viewRef, {
      ...buildEmployeeSelfView(snap.data() as EmployeeData),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}
