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
  if (callerRole !== "admin" || !callerCompanyId) {
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
  if (callerRole !== "admin" || !callerCompanyId) {
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
  if (callerRole !== "admin" || !callerCompanyId) {
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

export const setSupervisorStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if (callerRole !== "admin" || !callerCompanyId) {
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

  await employeeRef.update({ isSupervisor });

  if (!isSupervisor && employee.linkedUserId) {
    // No claim change needed today: acceptInvite always grants role
    // "supervisor" and there is no lesser role to fall back to. If that
    // changes, set the downgraded claim here.
  }

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
  if (callerRole !== "admin" || !callerCompanyId) {
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

// Fully detaches a supervisor's login so the same email can be invited
// fresh later (Firebase Auth enforces unique emails per project, so
// leaving the old Auth user behind is what makes re-inviting fail).
// employees/{employeeId} itself is never deleted - clock history lives on
// it - only isSupervisor/linkedUserId are stripped, turning it back into
// a normal employee record. Auto-marked inactive since it no longer has
// login access; an admin can reactivate it as a plain employee later.
export const removeSupervisor = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if (callerRole !== "admin" || !callerCompanyId) {
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
  const employee = employeeSnap.data() as { linkedUserId?: string };
  const linkedUserId = employee.linkedUserId;
  if (!linkedUserId) {
    throw new HttpsError("failed-precondition", "This employee has no linked supervisor account.");
  }

  const userRef = db.collection("users").doc(linkedUserId);
  const userSnap = await userRef.get();
  const email = (userSnap.data() as { email?: string } | undefined)?.email ?? null;

  try {
    await admin.auth().deleteUser(linkedUserId);
  } catch (err: any) {
    if (err?.code !== "auth/user-not-found") throw err;
  }

  const batch = db.batch();
  batch.delete(userRef);
  batch.update(employeeRef, {
    isSupervisor: admin.firestore.FieldValue.delete(),
    linkedUserId: admin.firestore.FieldValue.delete(),
    active: false,
  });

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

  await batch.commit();

  await closeOpenSessionForDeactivation(callerCompanyId, employeeId, request.auth.uid);

  return { success: true };
});
