import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db, FREE_EMPLOYEE_CAP } from "./shared";
import { reserveNewPin } from "./pins";

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
    attendanceRules: {
      allowEarlyClockIn: true,
      allowLateClockOut: true,
      autoClockOut: false,
    },
    alerts: {
      maxHoursWarning: true,
      overtimeWarning: true,
      missedClockOutAlert: true,
    },
    ownerUid: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),

    planTier: "free",
    employeeCap: FREE_EMPLOYEE_CAP,
    activeEmployeeCount: 0,
    subscriptionStatus: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });

  const userRef = db.collection("users").doc(uid);
  batch.set(userRef, {
    role: "admin",
    companyId: companyId,
    email: email,
    name: name,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    agreedToTermsAt: admin.firestore.FieldValue.serverTimestamp(),
    termsVersion: termsVersion,
  });

  await batch.commit();

  await admin.auth().setCustomUserClaims(uid, { role: "admin", companyId: companyId });

  return { companyId: companyId };
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

  const name = (request.data && request.data.name ? String(request.data.name) : "").trim();
  if (!name || name.length > 200) {
    throw new HttpsError("invalid-argument", "A valid name is required.");
  }

  const existingUserDoc = await db.collection("users").doc(uid).get();
  if (existingUserDoc.exists) {
    throw new HttpsError("already-exists", "This account is already set up.");
  }

  const inviteQuery = await db
    .collection("invites")
    .where("email", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (inviteQuery.empty) {
    await admin.auth().deleteUser(uid);
    throw new HttpsError("not-found", "No pending invite found for this email.");
  }

  const inviteDoc = inviteQuery.docs[0];
  const invite = inviteDoc.data() as {
    companyId: string;
    assignedSiteIds?: string[];
  };

  const companyRef = db.collection("companies").doc(invite.companyId);
  const companySnap = await companyRef.get();
  const companyData = companySnap.data() as
    | { employeeCap?: number | null; activeEmployeeCount?: number }
    | undefined;

  const cap = companyData?.employeeCap ?? null;
  const currentCount = companyData?.activeEmployeeCount ?? 0;

  if (cap !== null && currentCount >= cap) {
    await admin.auth().deleteUser(uid);
    throw new HttpsError(
      "resource-exhausted",
      "This company has reached its employee limit. Ask an admin to upgrade the plan before accepting this invite."
    );
  }

  const employeesRef = companyRef.collection("employees");
  const pin = await reserveNewPin(invite.companyId);

  const batch = db.batch();

  const userRef = db.collection("users").doc(uid);
  batch.set(userRef, {
    role: "supervisor",
    companyId: invite.companyId,
    assignedSiteIds: invite.assignedSiteIds || [],
    name: name,
    email: email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const employeeRef = employeesRef.doc(uid);
  batch.set(employeeRef, {
    name: name,
    jobTitle: "Supervisor",
    assignedSiteIds: invite.assignedSiteIds || [],
    active: true,
    isSupervisor: true,
    linkedUserId: uid,
    pin: pin,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Finalize the PIN reservation claimed above with the real employeeId,
  // atomically with the employee/user docs it belongs to.
  const pinRef = db.collection("companies").doc(invite.companyId).collection("pins").doc(pin);
  batch.set(
    pinRef,
    {
      employeeId: uid,
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

  await admin.auth().setCustomUserClaims(uid, {
    role: "supervisor",
    companyId: invite.companyId,
  });

  return { companyId: invite.companyId };
});
