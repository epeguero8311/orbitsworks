import { onCall, HttpsError } from "firebase-functions/v2/https";
import { KIOSK_ENABLED } from "./flags";
import { isProPlan } from "./lib/signupShared";
import * as admin from "firebase-admin";
import { db, FREE_EMPLOYEE_CAP, isOverActiveCap, isOverTotalCap, EmployeeCapFields } from "./shared";
import { reserveNewPin } from "./pins";
import { employeeDocPinOnCreate, employeePinData, employeePinRef } from "./lib/employeePin";
import { acceptInviteSchema, pickStaffInvite } from "./staffInviteValidators";
import { NEW_ADMIN_ACCESS } from "./adminAccessModel";
import { writeRoleClaims } from "./adminAccess";

export const createCompany = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;
  const email = request.auth.token.email;
  if (!email) {
    throw new HttpsError("failed-precondition", "Account has no email.");
  }

  const companyName = (request.data && request.data.companyName ? String(request.data.companyName) : "").trim();
  const name = (request.data && request.data.name ? String(request.data.name) : "").trim();

  if (!companyName || companyName.length > 200) {
    throw new HttpsError("invalid-argument", "A valid company name is required.");
  }
  if (!name || name.length > 200) {
    throw new HttpsError("invalid-argument", "A valid name is required.");
  }

  const agreedToTerms = request.data && request.data.agreedToTerms === true;
  const termsVersion = (request.data && request.data.termsVersion ? String(request.data.termsVersion) : "").trim();
  if (!agreedToTerms) {
    throw new HttpsError("failed-precondition", "You must agree to the Terms and Conditions.");
  }
  if (!termsVersion || termsVersion.length > 50) {
    throw new HttpsError("invalid-argument", "Missing terms version.");
  }

  const existingUserDoc = await db.collection("users").doc(uid).get();
  if (existingUserDoc.exists) {
    throw new HttpsError("already-exists", "This account is already set up.");
  }

  const companyRef = db.collection("companies").doc();
  const companyId = companyRef.id;

  const batch = db.batch();

  batch.set(companyRef, {
    name: companyName,
    authMode: "individual",
    businessHours: { open: "08:00", close: "17:00" },
    weeklyOvertimeThreshold: 40,
    overtimeMultiplier: 1.5,
    alerts: {
      maxHoursWarning: true,
      overtimeWarning: true,
      missedClockOutAlert: true,
    },
    // Saved up front so the server's "never saved = legacy re-detect" rule
    // (clockEvents.ts resolveAskJobSiteEachTime) never applies to a new
    // company - it gets the website's default, on.
    appSettings: { askJobSiteEachTime: true },
    ownerUid: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),

    planTier: "free",
    employeeCap: FREE_EMPLOYEE_CAP,
    activeEmployeeCount: 0,
    totalEmployeeCap: null,
    totalEmployeeCount: 0,
    subscriptionStatus: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,

    agreedToTermsAt: admin.firestore.FieldValue.serverTimestamp(),
    termsVersion: termsVersion,
  });

  const userRef = db.collection("users").doc(uid);
  batch.set(userRef, {
    role: "owner",
    companyId: companyId,
    email: email,
    name: name,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    agreedToTermsAt: admin.firestore.FieldValue.serverTimestamp(),
    termsVersion: termsVersion,
  });

  await batch.commit();

  await admin.auth().setCustomUserClaims(uid, { role: "owner", companyId: companyId });

  return { companyId: companyId };
});

// Terms re-accept for existing companies (Terms Section 19, Privacy
// Policy Section 12). Owner-only - the owner is the one with authority to
// bind the company (see createCompany/TermsContent.tsx Section 1), so
// they're the only one who can accept on the company's behalf; admins and
// supervisors are never blocked by a stale termsVersion (see
// DashboardLayout.tsx, which only renders the re-accept modal for the
// owner). Writes the same two fields createCompany does, on both docs, so
// a re-accept looks identical to an original acceptance to anything that
// reads them later.
export const acceptUpdatedTerms = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  if (role !== "owner" || !companyId) {
    throw new HttpsError("permission-denied", "Only the company owner can accept updated terms.");
  }

  const termsVersion = (request.data && request.data.termsVersion ? String(request.data.termsVersion) : "").trim();
  if (!termsVersion || termsVersion.length > 50) {
    throw new HttpsError("invalid-argument", "Missing terms version.");
  }

  const uid = request.auth.uid;
  const batch = db.batch();
  batch.update(db.collection("companies").doc(companyId), {
    agreedToTermsAt: admin.firestore.FieldValue.serverTimestamp(),
    termsVersion,
  });
  batch.update(db.collection("users").doc(uid), {
    agreedToTermsAt: admin.firestore.FieldValue.serverTimestamp(),
    termsVersion,
  });
  await batch.commit();

  return { success: true };
});

export const acceptInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;
  const email = (request.auth.token.email || "").toLowerCase();
  if (!email) {
    throw new HttpsError("failed-precondition", "Account has no email.");
  }

  const existingUserDoc = await db.collection("users").doc(uid).get();
  if (existingUserDoc.exists) {
    throw new HttpsError("already-exists", "This account is already set up.");
  }

  const parsedInput = acceptInviteSchema.safeParse(request.data ?? {});
  if (!parsedInput.success) {
    await admin.auth().deleteUser(uid);
    throw new HttpsError("invalid-argument", parsedInput.error.issues[0]?.message ?? "Invalid request.");
  }
  const { inviteId } = parsedInput.data;

  // The invite the person came from (?invite= on the link), never just any
  // pending invite that happens to match their email - see pickStaffInvite.
  let byId: { id: string; email?: string; status?: string } | null = null;
  let pendingForEmail: Array<{ id: string; email?: string; status?: string }> = [];
  if (inviteId) {
    const snap = await db.collection("invites").doc(inviteId).get();
    byId = snap.exists ? { id: snap.id, ...(snap.data() as { email?: string; status?: string }) } : null;
  } else {
    const q = await db
      .collection("invites")
      .where("email", "==", email)
      .where("status", "==", "pending")
      .limit(2)
      .get();
    pendingForEmail = q.docs.map((d) => ({ id: d.id, ...(d.data() as { email?: string; status?: string }) }));
  }
  const pick = pickStaffInvite(email, inviteId, byId, pendingForEmail);
  if (!pick.ok) {
    await admin.auth().deleteUser(uid);
    if (pick.reason === "ambiguous") {
      throw new HttpsError(
        "failed-precondition",
        "You have more than one invite. Open the link in the invite email from the company you want to join."
      );
    }
    if (pick.reason === "notPending") {
      throw new HttpsError("failed-precondition", "This invite has already been used or is no longer active.");
    }
    // notFound and notForThisEmail look the same from outside.
    throw new HttpsError("not-found", "No pending invite found for this email.");
  }

  const inviteDoc = await db.collection("invites").doc(pick.id).get();
  const invite = inviteDoc.data() as {
    companyId: string;
    role?: "supervisor" | "admin" | "kiosk";
    assignedSiteIds?: string[];
    linkExistingEmployeeId?: string;
    name?: string;
  };
  // Task 5 (K5): a kiosk invite links an existing record as the tablet's
  // login - its own branch, so the supervisor/admin paths below are unchanged.
  if (invite.role === "kiosk") {
    const deviceName = typeof request.data?.name === "string" ? request.data.name : "";
    return acceptKioskInvite(uid, email, inviteDoc.ref, invite, deviceName);
  }
  const role: "supervisor" | "admin" = invite.role === "admin" ? "admin" : "supervisor";

  const companyRef = db.collection("companies").doc(invite.companyId);
  const employeesRef = companyRef.collection("employees");

  // --- Promote an existing employee in place (Edit Employee modal's
  // Supervisor access toggle) - update the SAME doc, never create a new
  // one, never touch clockEvents. The employee's own assignedSiteIds is
  // authoritative here, not whatever the invite snapshotted, since an
  // admin could have edited it after sending the invite.
  if (invite.linkExistingEmployeeId) {
    const employeeRef = employeesRef.doc(invite.linkExistingEmployeeId);
    const employeeSnap = await employeeRef.get();
    if (!employeeSnap.exists) {
      await admin.auth().deleteUser(uid);
      throw new HttpsError("not-found", "The employee record for this invite no longer exists.");
    }
    const employee = employeeSnap.data() as { name?: string; linkedUserId?: string; assignedSiteIds?: string[] };
    if (employee.linkedUserId) {
      await admin.auth().deleteUser(uid);
      throw new HttpsError("failed-precondition", "This employee already has a linked account.");
    }

    // Never the client-typed name here, even though /join collects one -
    // whatever the invitee types is discarded for a promotion invite.
    // invite.name is the snapshot taken when the promotion was sent;
    // employee.name covers an invite created before that field existed.
    const linkedName = (invite.name || employee.name || "").trim();
    if (!linkedName) {
      await admin.auth().deleteUser(uid);
      throw new HttpsError("failed-precondition", "This employee record has no name on file.");
    }

    const batch = db.batch();

    const userRef = db.collection("users").doc(uid);
    batch.set(userRef, {
      role,
      companyId: invite.companyId,
      assignedSiteIds: employee.assignedSiteIds || [],
      name: linkedName,
      email: email,
      // Task 4 (D9/D16): a new admin starts with no sites + no permissions,
      // whatever the invite says - only setAdminAccess grants access.
      ...(role === "admin" ? { adminAccess: NEW_ADMIN_ACCESS } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(employeeRef, {
      linkedUserId: uid,
      // Only a supervisor invite implies override/break authority by
      // default - an admin invite doesn't, since AdminInvites offers no
      // supervisor-access step at invite time. An owner can still turn
      // Supervisor access on for an admin afterward via setEmployeeRole.
      isSupervisor: role !== "admin",
      isAdmin: role === "admin",
      email: email,
    });

    batch.update(inviteDoc.ref, {
      status: "accepted",
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      acceptedByUid: uid,
    });

    await batch.commit();

    await writeRoleClaims(uid, {
      role,
      companyId: invite.companyId,
      employeeId: invite.linkExistingEmployeeId,
    });

    return { companyId: invite.companyId, role };
  }

  // --- Fresh invite: no employee history, create a brand new doc with
  // an auto-generated ID (never assumed to equal uid - see linkedUserId
  // as the join instead). Unlike the link branch above, there's no
  // existing name to fall back to, so the client-typed name is the only
  // source and still has to be validated here.
  const name = (request.data && request.data.name ? String(request.data.name) : "").trim();
  if (!name || name.length > 200) {
    await admin.auth().deleteUser(uid);
    throw new HttpsError("invalid-argument", "A valid name is required.");
  }

  const companySnap = await companyRef.get();
  const companyData = companySnap.data() as
    | (EmployeeCapFields & { subscriptionStatus?: string })
    | undefined;

  if (companyData?.subscriptionStatus === "past_due") {
    await admin.auth().deleteUser(uid);
    throw new HttpsError("failed-precondition", "Subscription is past due.");
  }
  if (isOverActiveCap(companyData)) {
    await admin.auth().deleteUser(uid);
    throw new HttpsError(
      "resource-exhausted",
      "This company has reached its employee limit. Ask an admin to upgrade the plan before accepting this invite."
    );
  }
  if (isOverTotalCap(companyData)) {
    await admin.auth().deleteUser(uid);
    throw new HttpsError(
      "resource-exhausted",
      "This company has reached its total employee record limit. Ask an admin to delete some old employee records before accepting this invite."
    );
  }

  const pin = await reserveNewPin(invite.companyId);
  const employeeRef = employeesRef.doc();

  const batch = db.batch();

  const userRef = db.collection("users").doc(uid);
  batch.set(userRef, {
    role,
    companyId: invite.companyId,
    assignedSiteIds: invite.assignedSiteIds || [],
    name: name,
    email: email,
    // Task 4 (D9/D16): see the promote branch above.
    ...(role === "admin" ? { adminAccess: NEW_ADMIN_ACCESS } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  batch.set(employeeRef, {
    name: name,
    jobTitle: role === "admin" ? "Admin" : "Supervisor",
    assignedSiteIds: invite.assignedSiteIds || [],
    active: true,
    // See the promote-in-place branch above for why this follows role
    // instead of being unconditionally true.
    isSupervisor: role !== "admin",
    isAdmin: role === "admin",
    linkedUserId: uid,
    email: email,
    ...employeeDocPinOnCreate(pin),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(employeePinRef(invite.companyId, employeeRef.id), employeePinData(pin));

  // Finalize the PIN reservation claimed above with the real employeeId,
  // atomically with the employee/user docs it belongs to.
  const pinRef = db.collection("companies").doc(invite.companyId).collection("pins").doc(pin);
  batch.set(
    pinRef,
    {
      employeeId: employeeRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.update(inviteDoc.ref, {
    status: "accepted",
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    acceptedByUid: uid,
  });

  await batch.commit();

  await writeRoleClaims(uid, {
    role,
    companyId: invite.companyId,
    employeeId: employeeRef.id,
  });

  return { companyId: invite.companyId, role };
});

// Task 5 (K5/K7): Edit Employee -> Kiosk access on a record with no login
// sends a kiosk invite; accepting it makes this login the record's kiosk
// login. Re-checks what setEmployeeRole checks (flag, Pro, not an Employee
// App login, not clocked in), since time passed since the invite was sent.
// Any refusal removes the just-created Auth user, like every branch above.
async function acceptKioskInvite(
  uid: string,
  email: string,
  inviteRef: FirebaseFirestore.DocumentReference,
  invite: { companyId: string; linkExistingEmployeeId?: string; name?: string },
  deviceName: string
): Promise<{ companyId: string; role: "kiosk" }> {
  const refuse = async (code: "failed-precondition" | "not-found", message: string): Promise<never> => {
    await admin.auth().deleteUser(uid);
    throw new HttpsError(code, message);
  };
  if (!KIOSK_ENABLED.value()) return refuse("failed-precondition", "Kiosk mode isn't available yet.");
  // Task 5 v2 (2): Invites -> Kiosk makes a brand-new kiosk record from the
  // device name typed on /join (no selfie, birthday or consent - it's a
  // tablet). Kiosk records never count toward the caps (K8).
  if (!invite.linkExistingEmployeeId) {
    const name = deviceName.trim();
    if (!name || name.length > 60) return refuse("failed-precondition", "Enter a device name (up to 60 characters).");
    const companyRef = db.collection("companies").doc(invite.companyId);
    const companySnap = await companyRef.get();
    if (!isProPlan(companySnap.data()?.planTier as string | undefined)) return refuse("failed-precondition", "Kiosk access is a Pro feature.");
    // K8: the kiosk's own PIN stays reserved (unique) but never punches.
    const pin = await reserveNewPin(invite.companyId);
    const employeeRef = companyRef.collection("employees").doc();
    const batch = db.batch();
    batch.set(db.collection("users").doc(uid), {
      role: "kiosk",
      companyId: invite.companyId,
      name,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(employeeRef, {
      name,
      jobTitle: "Kiosk",
      assignedSiteIds: [],
      active: true,
      kiosk: true,
      appType: "kiosk",
      isSupervisor: false,
      isAdmin: false,
      linkedUserId: uid,
      email,
      ...employeeDocPinOnCreate(pin),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(employeePinRef(invite.companyId, employeeRef.id), employeePinData(pin));
    batch.set(companyRef.collection("pins").doc(pin), { employeeId: employeeRef.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.update(inviteRef, {
      status: "accepted",
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      acceptedByUid: uid,
    });
    await batch.commit();
    await writeRoleClaims(uid, { role: "kiosk", companyId: invite.companyId, employeeId: employeeRef.id });
    return { companyId: invite.companyId, role: "kiosk" };
  }
  const companyRef = db.collection("companies").doc(invite.companyId);
  const employeeRef = companyRef.collection("employees").doc(invite.linkExistingEmployeeId);
  const [companySnap, employeeSnap] = await Promise.all([companyRef.get(), employeeRef.get()]);
  if (!employeeSnap.exists) return refuse("not-found", "The record for this invite no longer exists.");
  if (!isProPlan(companySnap.data()?.planTier as string | undefined)) return refuse("failed-precondition", "Kiosk access is a Pro feature.");
  const employee = employeeSnap.data() as {
    name?: string;
    linkedUserId?: string;
    appAccess?: boolean;
    active?: boolean;
    lastEventType?: string | null;
  };
  if (employee.linkedUserId) return refuse("failed-precondition", "This record already has a linked account.");
  if (employee.appAccess === true) return refuse("failed-precondition", "This record has an Employee App login and can't be a kiosk.");
  if (employee.active !== true) return refuse("failed-precondition", "This record is inactive.");
  if (employee.lastEventType && employee.lastEventType !== "out") return refuse("failed-precondition", "This record is clocked in. Ask your admin to clock it out first.");
  const name = (invite.name || employee.name || "").trim() || "Kiosk";

  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), {
    role: "kiosk",
    companyId: invite.companyId,
    name,
    email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.update(employeeRef, { linkedUserId: uid, kiosk: true, isSupervisor: false, isAdmin: false, email });
  batch.update(inviteRef, {
    status: "accepted",
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    acceptedByUid: uid,
  });
  await batch.commit();
  await writeRoleClaims(uid, { role: "kiosk", companyId: invite.companyId, employeeId: invite.linkExistingEmployeeId });
  return { companyId: invite.companyId, role: "kiosk" };
}
