import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { db, deactivateEmployeeAuth, closeOpenSessionForDeactivation } from "./shared";
import { reserveNewPin } from "./pins";

// Creates the employee doc and reserves its PIN entirely server-side
// (Admin SDK transaction via reserveNewPin, same primitive acceptInvite
// uses) instead of the old client pattern of fetching every employee doc
// just to build a uniqueness Set - that full-collection read is what made
// Add Employee feel like it hung before the plan-limit check even ran.
export const addEmployee = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const data = request.data ?? {};
  const name = (data.name ? String(data.name) : "").trim();
  if (!name) {
    throw new HttpsError("invalid-argument", "name is required.");
  }
  const jobId = data.jobId ? String(data.jobId) : null;
  const jobTitle = data.jobTitle ? String(data.jobTitle).trim() : "";
  const hourlyRate =
    data.hourlyRate === null || data.hourlyRate === undefined || data.hourlyRate === ""
      ? null
      : Number(data.hourlyRate);
  const assignedSiteIds: string[] = Array.isArray(data.assignedSiteIds)
    ? data.assignedSiteIds.map((id: unknown) => String(id))
    : [];
  const subcontractorId = data.subcontractorId ? String(data.subcontractorId) : null;
  const subcontractorName = data.subcontractorName ? String(data.subcontractorName) : null;

  const companySnap = await db.collection("companies").doc(callerCompanyId).get();
  const company = companySnap.data() as
    | { employeeCap?: number | null; activeEmployeeCount?: number; subscriptionStatus?: string }
    | undefined;
  const cap = company?.employeeCap ?? null;
  const currentCount = company?.activeEmployeeCount ?? 0;
  if (company?.subscriptionStatus === "past_due") {
    throw new HttpsError("failed-precondition", "Subscription is past due.");
  }
  if (cap !== null && currentCount >= cap) {
    throw new HttpsError("resource-exhausted", "This company has reached its employee limit.");
  }

  const companyRef = db.collection("companies").doc(callerCompanyId);
  const employeeRef = companyRef.collection("employees").doc();
  const pin = await reserveNewPin(callerCompanyId);

  const batch = db.batch();
  batch.set(employeeRef, {
    name,
    jobId,
    jobTitle,
    assignedSiteIds,
    hourlyRate,
    active: true,
    pin,
    subcontractorId,
    subcontractorName,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  // Finalizes the placeholder reserveNewPin left behind - same
  // reserve-then-finalize pattern acceptInvite uses for supervisors.
  batch.set(
    companyRef.collection("pins").doc(pin),
    { employeeId: employeeRef.id, updatedAt: admin.firestore.Timestamp.now() },
    { merge: true }
  );
  await batch.commit();

  return { employeeId: employeeRef.id, pin };
});

export const setEmployeeActive = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const employeeId = (request.data && request.data.employeeId ? String(request.data.employeeId) : "").trim();
  const active = !!(request.data && request.data.active);
  if (!employeeId) {
    throw new HttpsError("invalid-argument", "employeeId is required.");
  }

  const employeeRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("employees")
    .doc(employeeId);
  const employeeSnap = await employeeRef.get();
  if (!employeeSnap.exists) {
    throw new HttpsError("not-found", "Employee not found.");
  }
  const employee = employeeSnap.data() as {
    linkedUserId?: string;
    active?: boolean;
  };

  if (active && employee.active !== true) {
    const companySnap = await db.collection("companies").doc(callerCompanyId).get();
    const company = companySnap.data() as
      | { employeeCap?: number | null; activeEmployeeCount?: number; subscriptionStatus?: string }
      | undefined;
    const cap = company?.employeeCap ?? null;
    const currentCount = company?.activeEmployeeCount ?? 0;
    if (company?.subscriptionStatus === "past_due") {
      throw new HttpsError("failed-precondition", "Subscription is past due.");
    }
    if (cap !== null && currentCount >= cap) {
      throw new HttpsError("resource-exhausted", "This company has reached its employee limit.");
    }
  }

  await employeeRef.update({ active: active });

  if (!active) {
    await closeOpenSessionForDeactivation(callerCompanyId, employeeId, request.auth.uid);
  }

  const linkedUserId = employee.linkedUserId;
  if (linkedUserId) {
    if (!active) {
      await deactivateEmployeeAuth(linkedUserId);
    } else {
      await admin.auth().updateUser(linkedUserId, { disabled: false });
    }
  }

  return { success: true };
});

export const deactivateEmployeesBulk = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const employeeIds: string[] = Array.isArray(request.data?.employeeIds)
    ? request.data.employeeIds.map((id: unknown) => String(id))
    : [];
  if (employeeIds.length === 0) {
    throw new HttpsError("invalid-argument", "employeeIds is required.");
  }

  const employeesRef = db.collection("companies").doc(callerCompanyId).collection("employees");
  const batch = db.batch();
  const linkedUserIds: string[] = [];

  for (const employeeId of employeeIds) {
    const employeeSnap = await employeesRef.doc(employeeId).get();
    if (!employeeSnap.exists) continue;
    const employee = employeeSnap.data() as { linkedUserId?: string };
    batch.update(employeesRef.doc(employeeId), { active: false });
    if (employee.linkedUserId) {
      linkedUserIds.push(employee.linkedUserId);
    }
  }

  await batch.commit();

  for (const employeeId of employeeIds) {
    await closeOpenSessionForDeactivation(callerCompanyId, employeeId, request.auth.uid);
  }

  for (const linkedUserId of linkedUserIds) {
    await deactivateEmployeeAuth(linkedUserId);
  }

  return { success: true, deactivatedCount: employeeIds.length };
});

// Direct promotion/demotion for an employee who already has a linked
// login (accepted an invite via addEmployee -> promote-in-place or a
// fresh invite). Not a re-invite - the existing account, PIN, and clock
// history are untouched. isAdmin and isSupervisor are independent: admin
// gates web dashboard access (users/{uid}.role and the custom claim,
// which every admin-only route/rule checks), while isSupervisor gates
// mobile override/break authority (firestore.rules' isActiveSupervisor()
// checks only this field, never the role claim) - an admin with
// isSupervisor false can use the dashboard but can't authorize overrides
// on mobile, and vice versa. To promote an employee with no linked
// account yet, use the invite flow (invites/{id} with
// linkExistingEmployeeId) or setEmployeePinSupervisor instead. To remove
// them entirely, use deleteEmployee.
export const setEmployeeRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const employeeId = (request.data && request.data.employeeId ? String(request.data.employeeId) : "").trim();
  const isAdmin = !!(request.data && request.data.isAdmin);
  const isSupervisor = !!(request.data && request.data.isSupervisor);
  if (!employeeId) {
    throw new HttpsError("invalid-argument", "employeeId is required.");
  }

  const employeeRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("employees")
    .doc(employeeId);
  const employeeSnap = await employeeRef.get();
  if (!employeeSnap.exists) {
    throw new HttpsError("not-found", "Employee not found.");
  }
  const employee = employeeSnap.data() as { linkedUserId?: string };
  const linkedUserId = employee.linkedUserId;
  if (!linkedUserId) {
    throw new HttpsError(
      "failed-precondition",
      "This employee has no linked account yet - invite them first."
    );
  }

  const userRef = db.collection("users").doc(linkedUserId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "Linked account not found.");
  }
  // Company must always keep >=1 owner - the owner's role can never be
  // changed through this action (there is no employee-level path back to
  // them in the first place, since the signup account never gets an
  // employee doc, but this guard makes the invariant explicit).
  const linkedUser = userSnap.data() as { role?: string };
  if (linkedUser.role === "owner") {
    throw new HttpsError("failed-precondition", "The company owner's role can't be changed here.");
  }

  const dashboardRole = isAdmin ? "admin" : "supervisor";

  await employeeRef.update({ isSupervisor, isAdmin });
  await userRef.update({ role: dashboardRole });
  await admin.auth().setCustomUserClaims(linkedUserId, {
    role: dashboardRole,
    companyId: callerCompanyId,
    employeeId,
  });

  return { success: true };
});

// Grants or revokes PIN-only supervisor override access for an employee
// with no linked login - they can authorize clock-in overrides and
// start/end breaks for others on mobile using just their PIN, without
// ever getting an invite email or an app/dashboard account. Separate
// from setEmployeeRole above, which only handles employees who already
// have a linked account: an employee granted access here stays
// unlinked, and firestore.rules' isActiveSupervisor() only ever checks
// the employee doc's isSupervisor/active fields, never linkedUserId, so
// this is sufficient on its own for override authority. Adding an email
// later (Edit Employee modal) upgrades them to a real invite through the
// normal linkExistingEmployeeId flow instead of this callable.
export const setEmployeePinSupervisor = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const employeeId = (request.data && request.data.employeeId ? String(request.data.employeeId) : "").trim();
  const isSupervisor = !!(request.data && request.data.isSupervisor);
  if (!employeeId) {
    throw new HttpsError("invalid-argument", "employeeId is required.");
  }

  const employeeRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("employees")
    .doc(employeeId);
  const employeeSnap = await employeeRef.get();
  if (!employeeSnap.exists) {
    throw new HttpsError("not-found", "Employee not found.");
  }
  const employee = employeeSnap.data() as { linkedUserId?: string };
  if (employee.linkedUserId) {
    throw new HttpsError(
      "failed-precondition",
      "This employee already has a login - use the role toggle instead."
    );
  }

  await employeeRef.update({ isSupervisor });

  return { success: true };
});

export const onEmployeeWrite = onDocumentWritten(
  "companies/{companyId}/employees/{employeeId}",
  async (event) => {
    const companyId = event.params.companyId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    const wasActive = before ? before.active === true : false;
    const isActive = after ? after.active === true : false;

    if (wasActive === isActive) return;

    const delta = isActive ? 1 : -1;
    await db.collection("companies").doc(companyId).update({
      activeEmployeeCount: admin.firestore.FieldValue.increment(delta),
    });
  }
);

export const reassignEmployeeSubcontractor = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const employeeId = (request.data && request.data.employeeId ? String(request.data.employeeId) : "").trim();
  const rawNewSubcontractorId = request.data ? request.data.newSubcontractorId : undefined;
  const newSubcontractorId =
    rawNewSubcontractorId === null || rawNewSubcontractorId === undefined || rawNewSubcontractorId === ""
      ? null
      : String(rawNewSubcontractorId).trim();
  const reason = request.data && typeof request.data.reason === "string"
    ? request.data.reason.trim()
    : undefined;

  if (!employeeId) {
    throw new HttpsError("invalid-argument", "employeeId is required.");
  }

  const employeeRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("employees")
    .doc(employeeId);
  const employeeSnap = await employeeRef.get();
  if (!employeeSnap.exists) {
    throw new HttpsError("not-found", "Employee not found.");
  }
  const employee = employeeSnap.data() as {
    subcontractorId?: string | null;
    subcontractorName?: string | null;
  };

  const previousSubcontractorId = employee.subcontractorId ?? null;
  const previousSubcontractorName = employee.subcontractorName ?? null;

  if (previousSubcontractorId === newSubcontractorId) {
    throw new HttpsError("failed-precondition", "Employee is already assigned to that company.");
  }

  let newSubcontractorName: string | null = null;
  if (newSubcontractorId) {
    const subcontractorRef = db
      .collection("companies")
      .doc(callerCompanyId)
      .collection("subcontractors")
      .doc(newSubcontractorId);
    const subcontractorSnap = await subcontractorRef.get();
    if (!subcontractorSnap.exists) {
      throw new HttpsError("not-found", "Subcontractor not found.");
    }
    const subcontractor = subcontractorSnap.data() as { name?: string; active?: boolean };
    if (!subcontractor.active) {
      throw new HttpsError("failed-precondition", "Subcontractor is not active.");
    }
    newSubcontractorName = subcontractor.name ?? "Unknown";
  }

  let changedByName = "Admin";
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  if (callerSnap.exists) {
    const callerData = callerSnap.data() as { name?: string };
    if (callerData.name) {
      changedByName = callerData.name;
    }
  }

  const assignmentRecord = {
    previousSubcontractorId,
    previousSubcontractorName,
    newSubcontractorId,
    newSubcontractorName,
    changedByUid: request.auth.uid,
    changedByName,
    changedAt: admin.firestore.Timestamp.now(),
    ...(reason ? { reason } : {}),
  };

  // subcontractorId/subcontractorName/subcontractorHistory are blocked
  // from direct client writes in firestore.rules - this Admin SDK call
  // is the only path that can change them. Clock events already in
  // existence for this employee are left untouched (they keep whatever
  // company was in effect when they were created); only new clock
  // events created after this point will snapshot the new company.
  await employeeRef.update({
    subcontractorId: newSubcontractorId,
    subcontractorName: newSubcontractorName,
    subcontractorHistory: admin.firestore.FieldValue.arrayUnion(assignmentRecord),
  });

  return { success: true };
});

// Permanently deletes an employee record, no matter the role (plain
// employee, supervisor, or admin) or current active/inactive status.
// clockEvents, timesheetApprovals, overrideEvents, and shiftNotes are
// NEVER touched - they all denormalize employeeName/siteName/etc at
// write time, so historical timesheets and reports keep reading
// correctly without this doc existing. If linked, the Auth account and
// users/{uid} doc are deleted first (so the same email can be invited
// fresh later - Firebase Auth enforces unique emails per project), any
// pending invite for that email is cleared, and the employee's PIN
// reservation is released so a future employee can reuse it.
export const deleteEmployee = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const employeeId = (request.data && request.data.employeeId ? String(request.data.employeeId) : "").trim();
  if (!employeeId) {
    throw new HttpsError("invalid-argument", "employeeId is required.");
  }

  const employeeRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("employees")
    .doc(employeeId);
  const employeeSnap = await employeeRef.get();
  if (!employeeSnap.exists) {
    throw new HttpsError("not-found", "Employee not found.");
  }
  const employee = employeeSnap.data() as { linkedUserId?: string; pin?: string };
  const linkedUserId = employee.linkedUserId;

  let email: string | null = null;

  if (linkedUserId) {
    const userRef = db.collection("users").doc(linkedUserId);
    const userSnap = await userRef.get();
    const userData = userSnap.data() as { email?: string; role?: string } | undefined;
    // Company must always keep >=1 owner. Structurally the owner never
    // has an employees doc in the first place, but this guard makes it
    // explicit rather than relying on that being true forever.
    if (userData?.role === "owner") {
      throw new HttpsError("failed-precondition", "The company owner's access can't be removed.");
    }
    email = userData?.email ?? null;

    try {
      await admin.auth().deleteUser(linkedUserId);
    } catch (err: any) {
      if (err?.code !== "auth/user-not-found") throw err;
    }
    await userRef.delete();
  }

  // Closes any still-open clock session before the employee doc is gone
  // - reads/writes clockEvents only (by employeeId, using the
  // denormalized name already on the latest event), never the employees
  // doc itself, so this is safe to run right up until the delete below.
  await closeOpenSessionForDeactivation(callerCompanyId, employeeId, request.auth.uid);

  const batch = db.batch();
  if (employee.pin) {
    batch.delete(
      db.collection("companies").doc(callerCompanyId).collection("pins").doc(employee.pin)
    );
  }
  if (email) {
    const invitesSnap = await db
      .collection("invites")
      .where("companyId", "==", callerCompanyId)
      .where("email", "==", email.toLowerCase())
      .get();
    for (const inviteDoc of invitesSnap.docs) {
      batch.delete(inviteDoc.ref);
    }
  }
  batch.delete(employeeRef);
  await batch.commit();

  return { success: true };
});
