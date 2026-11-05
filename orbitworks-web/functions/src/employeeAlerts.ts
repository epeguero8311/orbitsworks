import * as admin from "firebase-admin";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { Expo } from "expo-server-sdk";
import { db } from "./shared";
import { PUSH_NOTIFICATIONS_ENABLED } from "./flags";
import { sendExpoMessages } from "./pushSend";
import { clearEmployeePushTokenSchema, registerEmployeePushTokenSchema } from "./employeePushValidators";
import { EMPLOYEE_ALERT_RETENTION_DAYS } from "./employeeAlertTypes";
import type { EmployeeAlertText } from "./employeeShiftAlerts";

// ---- Employee App Phase 7: the employee's own alerts + push ----
//
// Push token: companies/{c}/employeePushTokens/{employeeId}, server-only
// (firestore.rules), one per employee - the phone they last signed in on.
//   registerEmployeePushToken - saves it, then removes the SAME token from
//     every other employee and every supervisor pushTokens doc (any
//     company), so a shared phone only ever gets the signed-in person's pushes.
//   clearEmployeePushToken - sign-out; removes it only if it is still this
//     phone's token (signing out on an old phone never unhooks the new one).
// Alerts: sendEmployeeAlert writes companies/{c}/employeeAlerts/{id} once
// (deterministic id + create()), then pushes. Called by the periodic sweep
// (alerts.ts). Never throws - a failed write or push never fails the sweep.
// Break warnings are local notifications on the phone, not sent from here.

function employeesCol(companyId: string) {
  return db.collection("companies").doc(companyId).collection("employees");
}

function tokenRef(companyId: string, employeeId: string) {
  return db.collection("companies").doc(companyId).collection("employeePushTokens").doc(employeeId);
}

function alertsCol(companyId: string) {
  return db.collection("companies").doc(companyId).collection("employeeAlerts");
}

// Same account check as employeeClockPunch: role employee + claims.
// Exported for the Phase 8 leave tracking calls (employeeSiteExits.ts).
export function employeeClaims(request: CallableRequest): { companyId: string; employeeId: string } {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  const employeeId = request.auth.token.employeeId as string | undefined;
  if (role !== "employee" || !companyId || !employeeId) {
    throw new HttpsError("permission-denied", "Only an employee app login can do this.");
  }
  return { companyId, employeeId };
}

// Every other place this exact token is saved: other employees' token docs
// and supervisor pushTokens docs, in any company (a phone can move between
// companies). Needs the collection-group token indexes in
// firestore.indexes.json (fieldOverrides).
async function removeTokenElsewhere(token: string, keep: admin.firestore.DocumentReference): Promise<number> {
  const [employeeTokens, companyTokens] = await Promise.all([
    db.collectionGroup("employeePushTokens").where("token", "==", token).get(),
    db.collectionGroup("pushTokens").where("token", "==", token).get(),
  ]);
  const stale = [...employeeTokens.docs, ...companyTokens.docs].filter((d) => d.ref.path !== keep.path);
  await Promise.all(stale.map((d) => d.ref.delete()));
  return stale.length;
}

export const registerEmployeePushToken = onCall(async (request) => {
  const { companyId, employeeId } = employeeClaims(request);
  const parsed = registerEmployeePushTokenSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid push token.");

  const employee = (await employeesCol(companyId).doc(employeeId).get()).data();
  if (!employee || employee.linkedUserId !== request.auth?.uid) {
    throw new HttpsError("permission-denied", "This login is no longer linked to an employee.");
  }

  const ref = tokenRef(companyId, employeeId);
  await ref.set({
    employeeId,
    token: parsed.data.token,
    platform: parsed.data.platform,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const removed = await removeTokenElsewhere(parsed.data.token, ref);
  return { ok: true, removed };
});

export const clearEmployeePushToken = onCall(async (request) => {
  const { companyId, employeeId } = employeeClaims(request);
  const parsed = clearEmployeePushTokenSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid push token.");

  const ref = tokenRef(companyId, employeeId);
  const cleared = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.token !== parsed.data.token) return false;
    tx.delete(ref);
    return true;
  });
  return { ok: true, cleared };
});

export interface EmployeeAlertInput extends EmployeeAlertText {
  companyId: string;
  employeeId: string;
  // Makes the id: one alert per (type, key). Shift alerts use the shift's
  // first event id; overtime uses employeeId + week; leftSite uses the
  // SiteExit id.
  key: string;
  shiftId: string | null;
  // Phase 8: false = save the alert but send no push (leftSite - the phone
  // already showed its own local notification). Default true.
  push?: boolean;
}

export function employeeAlertId(alertType: string, key: string): string {
  return `${alertType}-${key}`;
}

async function pushToEmployee(companyId: string, employeeId: string, alertId: string, input: EmployeeAlertInput): Promise<void> {
  if (!PUSH_NOTIFICATIONS_ENABLED.value()) return;
  const ref = tokenRef(companyId, employeeId);
  const token = (await ref.get()).data()?.token;
  if (typeof token !== "string" || !Expo.isExpoPushToken(token)) return;

  const stale = await sendExpoMessages(
    [
      {
        to: token,
        title: input.title,
        body: input.message,
        sound: "default",
        data: { employeeAlertId: alertId, alertType: input.alertType },
      },
    ],
    { companyId, employeeId }
  );
  if (!stale.includes(token)) return;
  // Only if it wasn't replaced by a new sign-in meanwhile.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.data()?.token === token) tx.delete(ref);
  });
}

// true = a new alert was written. Only employees with an app login get one
// (an employee with no login has no Alerts tab).
export async function sendEmployeeAlert(input: EmployeeAlertInput): Promise<boolean> {
  const { companyId, employeeId } = input;
  const alertId = employeeAlertId(input.alertType, input.key);
  try {
    const employee = (await employeesCol(companyId).doc(employeeId).get()).data();
    if (!employee || typeof employee.linkedUserId !== "string" || !employee.linkedUserId) return false;
    await alertsCol(companyId).doc(alertId).create({
      employeeId,
      alertType: input.alertType,
      title: input.title,
      message: input.message,
      reason: input.reason,
      shiftId: input.shiftId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    if (code !== 6 && code !== "already-exists") {
      console.warn("Employee alert write failed", { companyId, employeeId, alertId, error: String(err) });
    }
    return false;
  }

  if (input.push === false) return true;
  try {
    await pushToEmployee(companyId, employeeId, alertId, input);
  } catch (err) {
    console.warn("Employee push send failed", { companyId, employeeId, alertId, error: String(err) });
  }
  return true;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH = 400;

// Deletes employee alerts older than EMPLOYEE_ALERT_RETENTION_DAYS. One
// company's failure never stops the rest. Exported for tests.
export async function cleanupEmployeeAlertsRun(nowMs: number): Promise<number> {
  const cutoff = admin.firestore.Timestamp.fromMillis(nowMs - EMPLOYEE_ALERT_RETENTION_DAYS * DAY_MS);
  let deleted = 0;
  const companies = await db.collection("companies").get();
  for (const company of companies.docs) {
    try {
      for (;;) {
        const old = await alertsCol(company.id).where("createdAt", "<", cutoff).limit(CLEANUP_BATCH).get();
        if (old.empty) break;
        const batch = db.batch();
        old.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deleted += old.size;
        if (old.size < CLEANUP_BATCH) break;
      }
    } catch (err) {
      console.warn("Employee alert cleanup failed for company", { companyId: company.id, error: String(err) });
    }
  }
  return deleted;
}

export const cleanupEmployeeAlerts = onSchedule("every 24 hours", async () => {
  await cleanupEmployeeAlertsRun(Date.now());
});
