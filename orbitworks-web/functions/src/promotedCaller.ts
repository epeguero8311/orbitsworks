import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { db } from "./shared";

// RC1 (option C) and its follow-up: who may send items that were saved on
// the phone by an Employee App login.
//
// "employee"  - the Employee App login itself.
// "promoted"  - the same person after being made a supervisor/admin while
//               things were still queued on the phone. Only their OWN
//               queued items (their employeeId claim), and only for an
//               employee doc with appAccess (it came from the Employee App).
//               The supervisor app keeps sending those after the switch.
// null        - anyone else (owner, no role) - refused.
//
// Used by employeeClockPunch (queued punches only), recordSiteExit and
// reportRemovedItem. Every other Employee App callable stays "employee" only.
const PROMOTED_OWN_ITEM_ROLES = new Set(["supervisor", "admin"]);

export type QueueCallerKind = "employee" | "promoted";

export function punchCallerKind(role: string | undefined): QueueCallerKind | null {
  if (role === "employee") return "employee";
  if (role && PROMOTED_OWN_ITEM_ROLES.has(role)) return "promoted";
  return null;
}

const NOT_LINKED = "This login is no longer linked to an employee.";

// The caller's own employee, for a call that sends something from the
// phone's queue. Throws permission-denied unless the login is that
// employee's linked login (and, for a promoted login, appAccess is set).
export async function ownQueueCaller(request: CallableRequest): Promise<{
  kind: QueueCallerKind;
  companyId: string;
  employeeId: string;
  employee: FirebaseFirestore.DocumentData;
}> {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const kind = punchCallerKind(request.auth.token.role as string | undefined);
  const companyId = request.auth.token.companyId as string | undefined;
  const employeeId = request.auth.token.employeeId as string | undefined;
  if (!kind || !companyId || !employeeId) {
    throw new HttpsError("permission-denied", "Only an employee app login can do this.");
  }
  const employee = (await db.collection("companies").doc(companyId).collection("employees").doc(employeeId).get()).data();
  if (!employee || employee.linkedUserId !== request.auth.uid) throw new HttpsError("permission-denied", NOT_LINKED);
  if (kind === "promoted" && employee.appAccess !== true) throw new HttpsError("permission-denied", NOT_LINKED);
  return { kind, companyId, employeeId, employee };
}
