import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

function generateUniquePin(existingPins: Set<string>): string {
  let pin = "";
  let attempts = 0;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
    attempts++;
  } while (existingPins.has(pin) && attempts < 100);
  return pin;
}

// Called right after Firebase Auth account creation on /signup.
// Trusts only request.auth.uid (verified by Firebase) - never client-supplied
// role or companyId. Always mints a brand-new companyId, so a signup can
// never attach to an existing tenant.
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
      lateEmployeeAlert: false,
      noShowAlert: false,
      missedClockOutAlert: true,
      missedBreakAlert: false,
      lowStaffingAlert: true,
    },
    ownerUid: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const userRef = db.collection("users").doc(uid);
  batch.set(userRef, {
    role: "admin",
    companyId: companyId,
    email: email,
    name: name,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  await admin.auth().setCustomUserClaims(uid, { role: "admin", companyId: companyId });

  return { companyId: companyId };
});

// Called right after Firebase Auth account creation on /join.
// Looks up the pending invite server-side using the VERIFIED email on the
// auth token - never a client-supplied companyId or email. Rolls back the
// Auth account if no matching invite exists, same as the old client flow.
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

  const employeesRef = db.collection("companies").doc(invite.companyId).collection("employees");
  const existingEmployeesSnap = await employeesRef.get();
  const existingPins = new Set(
    existingEmployeesSnap.docs
      .map((d) => (d.data() as { pin?: string }).pin)
      .filter((p): p is string => !!p)
  );
  const pin = generateUniquePin(existingPins);

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
