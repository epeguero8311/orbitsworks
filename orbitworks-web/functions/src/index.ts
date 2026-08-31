import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
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

const FREE_EMPLOYEE_CAP = 8;

async function deactivateEmployeeAuth(linkedUserId: string) {
  await admin.auth().updateUser(linkedUserId, { disabled: true });
  await admin.auth().revokeRefreshTokens(linkedUserId);
}

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

export const verifyPin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const companyId = request.auth.token.companyId as string | undefined;
  const role = request.auth.token.role as string | undefined;
  if (!companyId || (role !== "admin" && role !== "supervisor")) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const pin = (request.data && request.data.pin ? String(request.data.pin) : "").trim();
  if (!/^\d{4}$/.test(pin)) {
    throw new HttpsError("invalid-argument", "PIN must be 4 digits.");
  }

  const uid = request.auth.uid;
  const attemptRef = db.collection("pinAttempts").doc(uid);
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxAttempts = 5;

  const attemptSnap = await attemptRef.get();
  let count = 0;
  let windowStart = now;

  if (attemptSnap.exists) {
    const data = attemptSnap.data() as { count?: number; windowStart?: number };
    if (data.windowStart && now - data.windowStart < windowMs) {
      count = data.count || 0;
      windowStart = data.windowStart;
    }
  }

  if (count >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((windowStart + windowMs - now) / 1000);
    throw new HttpsError(
      "resource-exhausted",
      "Too many attempts. Try again in " + retryAfterSeconds + " seconds."
    );
  }

  await attemptRef.set({ count: count + 1, windowStart: windowStart });

  const employeesRef = db.collection("companies").doc(companyId).collection("employees");
  const querySnap = await employeesRef
    .where("pin", "==", pin)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (querySnap.empty) {
    return { matched: false };
  }

  await attemptRef.delete();

  const employeeDoc = querySnap.docs[0];
  const employee = employeeDoc.data();

  return {
    matched: true,
    employee: {
      id: employeeDoc.id,
      name: employee.name,
      jobTitle: employee.jobTitle ?? null,
      photoUrl: employee.photoUrl ?? null,
      assignedSiteIds: employee.assignedSiteIds ?? [],
      isSupervisor: employee.isSupervisor ?? false,
    },
  };
});

// Returns the full PIN table (plaintext, over TLS) for the caller's
// company so the mobile app can hash it on-device and cache it for
// offline PIN validation. Also returns each employee's lastEventType
// (denormalized by onClockEventCreated below) so the app can determine
// current status (in/out/break) offline without a live Firestore query.
export const getPinSyncTable = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const companyId = request.auth.token.companyId as string | undefined;
  const role = request.auth.token.role as string | undefined;
  if (!companyId || (role !== "admin" && role !== "supervisor")) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const employeesRef = db.collection("companies").doc(companyId).collection("employees");
  const snap = await employeesRef.get();

  const employees = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        pin: data.pin ?? null,
        name: data.name ?? "",
        jobTitle: data.jobTitle ?? null,
        photoUrl: data.photoUrl ?? null,
        assignedSiteIds: data.assignedSiteIds ?? [],
        isSupervisor: data.isSupervisor ?? false,
        active: data.active === true,
        lastEventType: data.lastEventType ?? null,
      };
    })
    .filter((e) => !!e.pin);

  return { employees };
});

// Keeps employees/{employeeId}.lastEventType in sync with the most
// recent clock event, so getPinSyncTable can hand the mobile app a
// current-status snapshot without a separate per-employee query. This
// is what lets the app determine in/out/break offline.
export const onClockEventCreated = onDocumentCreated(
  "companies/{companyId}/clockEvents/{eventId}",
  async (event) => {
    const data = event.data?.data();
    if (!data || !data.employeeId) return;

    const companyId = event.params.companyId;
    const employeeId = data.employeeId as string;

    await db
      .collection("companies")
      .doc(companyId)
      .collection("employees")
      .doc(employeeId)
      .update({
        lastEventType: data.type,
        lastEventTimestamp: data.timestamp ?? admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch(() => {
        // Employee doc may not exist in edge cases (e.g. deleted between
        // event write and this trigger firing) - safe to ignore, this
        // field is a denormalized convenience, not the source of truth.
      });
  }
);

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

export const autoClockOutStaleSessions = onSchedule(
  { schedule: "0 23 * * *", timeZone: "America/Chicago" },
  async () => {
    const companiesSnap = await db.collection("companies").get();

    for (const companyDoc of companiesSnap.docs) {
      const company = companyDoc.data() as {
        attendanceRules?: { autoClockOut?: boolean };
        businessHours?: { close?: string };
      };

      if (!company.attendanceRules || !company.attendanceRules.autoClockOut) continue;

      const closeTimeStr = company.businessHours && company.businessHours.close
        ? company.businessHours.close
        : "17:00";
      const closeParts = closeTimeStr.split(":").map(Number);
      const closeH = closeParts[0];
      const closeM = closeParts[1];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const lookbackStart = admin.firestore.Timestamp.fromMillis(
        todayStart.getTime() - 3 * 24 * 60 * 60 * 1000
      );

      const eventsRef = companyDoc.ref.collection("clockEvents");
      const recentEventsSnap = await eventsRef
        .where("timestamp", ">=", lookbackStart)
        .orderBy("timestamp", "desc")
        .get();

      type LatestEvent = {
        type: string;
        timestamp: admin.firestore.Timestamp;
        siteId: string | null;
        siteName: string;
        employeeName: string;
      };

      const latestByEmployee = new Map<string, LatestEvent>();

      recentEventsSnap.docs.forEach((eventDoc) => {
        const data = eventDoc.data() as {
          employeeId: string;
          employeeName: string;
          type: string;
          timestamp: admin.firestore.Timestamp;
          siteId: string | null;
          siteName: string;
        };
        if (!latestByEmployee.has(data.employeeId)) {
          latestByEmployee.set(data.employeeId, {
            type: data.type,
            timestamp: data.timestamp,
            siteId: data.siteId,
            siteName: data.siteName,
            employeeName: data.employeeName,
          });
        }
      });

      const batch = db.batch();
      let hasWrites = false;

      latestByEmployee.forEach((latest, employeeId) => {
        if (latest.type !== "in") return;

        const eventDate = latest.timestamp.toDate();
        if (eventDate >= todayStart) return;

        const closeTimestamp = new Date(eventDate);
        closeTimestamp.setHours(closeH, closeM, 0, 0);

        const newEventRef = companyDoc.ref.collection("clockEvents").doc();
        batch.set(newEventRef, {
          employeeId: employeeId,
          employeeName: latest.employeeName,
          siteId: latest.siteId,
          siteName: latest.siteName,
          type: "out",
          source: "autoClockOut",
          note: "Automatically clocked out - session left open from a prior day",
          createdByUid: "system",
          timestamp: admin.firestore.Timestamp.fromDate(closeTimestamp),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        hasWrites = true;
      });

      if (hasWrites) {
        await batch.commit();
      }
    }
  }
);
