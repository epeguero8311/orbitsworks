// Where an employee's plain PIN lives (prod-readiness item 7 A).
//
// companies/{c}/employeePins/{employeeId} = { pin, updatedAt } is the
// server-only home of the PIN (firestore.rules denies every client). The
// old place, the `pin` field on companies/{c}/employees/{id}, is readable
// by every admin and supervisor of the company, so it is being retired in
// two phases:
//
//   i.  this release: every server write puts the PIN in employeePins AND
//       (while EMPLOYEE_DOC_PIN_REMOVED is false) on the employee doc, so
//       the website that is live today keeps showing PINs. Every read
//       prefers employeePins and falls back to the old field, so employees
//       not yet copied (scripts/migrateEmployeePins.js) keep working.
//   ii. only after the new website (reads PINs via getEmployeePins) is live
//       on prod: set EMPLOYEE_DOC_PIN_REMOVED=true in the project's
//       functions .env, deploy functions, then run
//       scripts/migrateEmployeePins.js --strip to delete the old field.
//
// Named so that UNSET = false = the safe, live-compatible phase i: a
// defineBoolean reads false at runtime when the env var is missing.
//
// The pins/{pin} reservation index (pins.ts) is unchanged.

import * as admin from "firebase-admin";
import { defineBoolean } from "firebase-functions/params";
import { db } from "../shared";

export const EMPLOYEE_DOC_PIN_REMOVED = defineBoolean("EMPLOYEE_DOC_PIN_REMOVED", { default: false });

export function isPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

export function employeePinRef(companyId: string, employeeId: string) {
  return db.collection("companies").doc(companyId).collection("employeePins").doc(employeeId);
}

export function employeePinsCollection(companyId: string) {
  return db.collection("companies").doc(companyId).collection("employeePins");
}

// The employeePins doc body.
export function employeePinData(pin: string) {
  return { pin, updatedAt: admin.firestore.Timestamp.now() };
}

function keepOnEmployeeDoc(): boolean {
  return EMPLOYEE_DOC_PIN_REMOVED.value() !== true;
}

// Spread into a NEW employee doc (set/create): { pin } in phase i, nothing
// in phase ii.
export function employeeDocPinOnCreate(pin: string): { pin?: string } {
  return keepOnEmployeeDoc() ? { pin } : {};
}

// Spread into an employee doc UPDATE: { pin } in phase i, a delete of the
// old field in phase ii.
export function employeeDocPinOnUpdate(pin: string): { pin: string | admin.firestore.FieldValue } {
  return keepOnEmployeeDoc() ? { pin } : { pin: admin.firestore.FieldValue.delete() };
}

// employeePins first, the old employee field as the fallback.
export function pickPin(pinDoc: unknown, employeeData: unknown): string | null {
  const fromDoc = (pinDoc as { pin?: unknown } | undefined | null)?.pin;
  if (isPin(fromDoc)) return fromDoc;
  const legacy = (employeeData as { pin?: unknown } | undefined | null)?.pin;
  return isPin(legacy) ? legacy : null;
}

export async function readEmployeePin(
  companyId: string,
  employeeId: string,
  employeeData: unknown,
  tx?: admin.firestore.Transaction
): Promise<string | null> {
  const ref = employeePinRef(companyId, employeeId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return pickPin(snap.data(), employeeData);
}

// Every PIN in the company, keyed by employeeId (the employee docs passed
// in supply the fallback).
export async function readCompanyPins(
  companyId: string,
  employeeDocs: Array<{ id: string; data(): unknown }>
): Promise<Map<string, string>> {
  const pinsSnap = await employeePinsCollection(companyId).get();
  const fromDocs = new Map(pinsSnap.docs.map((d) => [d.id, d.data()]));
  const out = new Map<string, string>();
  for (const e of employeeDocs) {
    const pin = pickPin(fromDocs.get(e.id), e.data());
    if (pin) out.set(e.id, pin);
  }
  return out;
}

// The ACTIVE employee holding this PIN, or null (verifyPin, temp clock
// links). employeePins first; an employee not copied yet is still found by
// the old field.
export async function findActiveEmployeeByPin(
  companyId: string,
  pin: string
): Promise<admin.firestore.DocumentSnapshot | null> {
  const employeesRef = db.collection("companies").doc(companyId).collection("employees");
  const holders = await employeePinsCollection(companyId).where("pin", "==", pin).limit(5).get();
  for (const h of holders.docs) {
    const emp = await employeesRef.doc(h.id).get();
    if (emp.exists && emp.get("active") === true) return emp;
  }
  const legacy = await employeesRef.where("pin", "==", pin).where("active", "==", true).limit(5).get();
  for (const emp of legacy.docs) {
    // A legacy match only counts if the employee has no newer PIN in
    // employeePins (a changed PIN must not keep working via the old field).
    const current = await employeePinRef(companyId, emp.id).get();
    if (!current.exists || current.get("pin") === pin) return emp;
  }
  return null;
}
