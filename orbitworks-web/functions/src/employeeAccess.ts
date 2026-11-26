import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./shared";
import { writeRoleClaims } from "./adminAccess";

// ---- Employee App (self-service) login ----
//
// The "employee" role uses the exact same storage as every other role:
// users/{uid}.role plus the role/companyId/employeeId custom claims, kept in
// sync here by the Admin SDK only (firestore.rules denies every client write
// to users/{uid}, and only the Admin SDK can set claims). The employee doc
// is linked the same way supervisors are (linkedUserId + email), plus
// appAccess: true - the one field that says "has an employee-app login".

export type LoginRole = "admin" | "supervisor" | "employee" | "kiosk";
// "invite" = Phase 3B email invite (employeeInviteTypes.ts).
export type EmployeeJoinedVia = "admin" | "qr" | "invite";

// Task 5 v2 (A): the app type picked on the website (radio), separate from
// Admin access. "none" = website-only admin (only with isAdmin).
export type AppType = "employee" | "supervisor" | "kiosk" | "none";
export const APP_TYPES: readonly AppType[] = ["employee", "supervisor", "kiosk", "none"];

type RoleFields = {
  kiosk?: boolean;
  isAdmin?: boolean;
  isSupervisor?: boolean;
  appAccess?: boolean;
  appType?: unknown;
};

// Which app mode a linked login opens. An explicit appType (set by the
// Task 5 v2 radio) wins; records saved before it keep their old mode:
// supervisor or admin -> supervisor app, Employee App login -> employee
// app, any other linked login -> the legacy supervisor floor.
export function appModeFor(employee: RoleFields): AppType {
  if (employee.kiosk) return "kiosk";
  const t = employee.appType;
  if (t === "employee" || t === "supervisor") return t;
  if (t === "none" && employee.isAdmin) return "none";
  if (employee.isSupervisor || employee.isAdmin) return "supervisor";
  return employee.appAccess ? "employee" : "supervisor";
}

// Single place that decides which role claim a linked employee doc maps
// to. Kiosk wins (Task 5 K5/K7), then admin (website access; the app mode
// rides in the appMode claim, adminAccess.ts writeRoleClaims), then the
// app mode: employee app -> "employee", else "supervisor" (incl. the
// legacy floor for a linked login with neither toggle).
export function loginRoleFor(employee: RoleFields): LoginRole {
  if (employee.kiosk) return "kiosk";
  if (employee.isAdmin) return "admin";
  return appModeFor(employee) === "employee" ? "employee" : "supervisor";
}

// Task 5 v2 (A): an Employee App caller = role "employee", or an admin
// whose app type is the Employee app (appMode claim). Every employee-app
// callable checks this instead of role === "employee".
export function isEmployeeAppToken(token: { role?: unknown; appMode?: unknown } | undefined): boolean {
  if (!token) return false;
  return token.role === "employee" || (token.role === "admin" && token.appMode === "employee");
}

export interface LinkEmployeeLoginInput {
  uid: string;
  companyId: string;
  employeeId: string;
  email: string;
  joinedVia: EmployeeJoinedVia;
  joinCodeId?: string | null;
  // Required when joinedVia is "invite": the invite's stable inviteId,
  // never its token (the employee can read their own employee doc).
  employeeInviteId?: string | null;
}

// Gives an EXISTING employee doc an Employee App login. Phase 2's QR
// sign-up, Phase 3B's email invite (acceptEmployeeInvite.ts) and
// functions/scripts/devCreateEmployeeLogin.js on dev call this after
// creating/finding the employee doc and the Auth user.
//
// Idempotent for the same uid/employee pair (a retry after a partial
// failure just rewrites the same values). Refuses to touch an employee
// already linked to a different login, a users doc that belongs to another
// company or role, or a company owner.
export async function linkEmployeeLogin(input: LinkEmployeeLoginInput): Promise<void> {
  const { uid, companyId, employeeId, joinedVia } = input;
  const email = input.email.trim().toLowerCase();
  if (!uid || !companyId || !employeeId || !email) {
    throw new HttpsError("invalid-argument", "uid, companyId, employeeId and email are required.");
  }
  if (joinedVia === "qr" && !input.joinCodeId) {
    throw new HttpsError("invalid-argument", "joinCodeId is required when joinedVia is qr.");
  }
  if (joinedVia === "invite" && !input.employeeInviteId) {
    throw new HttpsError("invalid-argument", "employeeInviteId is required when joinedVia is invite.");
  }

  const employeeRef = db.collection("companies").doc(companyId).collection("employees").doc(employeeId);
  const userRef = db.collection("users").doc(uid);
  const [employeeSnap, userSnap] = await Promise.all([employeeRef.get(), userRef.get()]);

  if (!employeeSnap.exists) {
    throw new HttpsError("not-found", "Employee not found.");
  }
  const employee = employeeSnap.data() as {
    name?: string;
    linkedUserId?: string;
    assignedSiteIds?: string[];
    isAdmin?: boolean;
    isSupervisor?: boolean;
    kiosk?: boolean;
  };
  // Task 5 (K8): a kiosk record is a shared tablet, never a person's own
  // Employee App login.
  if (employee.kiosk === true) {
    throw new HttpsError("failed-precondition", "This record is a kiosk tablet, not an employee.");
  }
  if (employee.linkedUserId && employee.linkedUserId !== uid) {
    throw new HttpsError("failed-precondition", "This employee already has a linked account.");
  }

  if (userSnap.exists) {
    const existing = userSnap.data() as { companyId?: string; role?: string };
    if (existing.role === "owner") {
      throw new HttpsError("failed-precondition", "The company owner can't be linked as an employee.");
    }
    if (existing.companyId !== companyId || employee.linkedUserId !== uid) {
      throw new HttpsError("already-exists", "This account is already set up.");
    }
  }

  // An already-promoted employee re-running this keeps their higher role.
  const role = loginRoleFor({ ...employee, appAccess: true });

  const batch = db.batch();
  batch.set(
    userRef,
    {
      role,
      companyId,
      assignedSiteIds: employee.assignedSiteIds ?? [],
      name: employee.name ?? "",
      email,
      ...(userSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );
  batch.update(employeeRef, {
    linkedUserId: uid,
    email,
    appAccess: true,
    joinedVia,
    joinCodeId: joinedVia === "qr" ? input.joinCodeId ?? null : null,
    // Only written for invites, so QR / admin links keep their exact shape.
    ...(joinedVia === "invite" ? { employeeInviteId: input.employeeInviteId ?? null } : {}),
  });
  await batch.commit();

  // Task 4: keeps an admin's access mirror (writeRoleClaims).
  await writeRoleClaims(uid, { role, companyId, employeeId });
}
