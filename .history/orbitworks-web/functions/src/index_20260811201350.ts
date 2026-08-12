import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

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
const PHOTO_RETENTION_DAYS = 14;

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

// Runs once daily. Finds clock event photos older than the retention
// window, deletes the file from Storage, and clears photoUrl on the
// record so the event itself stays intact for reporting but the image
// is gone - matching the Privacy Policy's stated retention period.
export const deleteOldClockPhotos = onSchedule("every 24 hours", async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(
    Date.now() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const companiesSnap = await db.collection("companies").get();

  for (const companyDoc of companiesSnap.docs) {
    const eventsRef = companyDoc.ref.collection("clockEvents");
    const oldEventsSnap = await eventsRef
      .where("timestamp", "<", cutoff)
      .where("photoUrl", "!=", null)
      .get();

    for (const eventDoc of oldEventsSnap.docs) {
      const data = eventDoc.data() as { photoUrl?: string };
      if (!data.photoUrl) continue;

      try {
        const bucket = storage.bucket();
        const url = new URL(data.photoUrl);
        const pathMatch = url.pathname.match(/\/o\/(.+)$/);
        if (pathMatch) {
          const filePath = decodeURIComponent(pathMatch[1]);
          await bucket.file(filePath).delete({ ignoreNotFound: true });
        }
      } catch (err) {
        console.error(`Failed to delete photo for event ${eventDoc.id}:`, err);
      }

      await eventDoc.ref.update({ photoUrl: admin.firestore.FieldValue.delete() });
    }
  }
});

});

export const autoClockOutStaleSessions = onSchedule(
  { schedule: "0 23 * * *", timeZone: "America/Chicago" },
  async () => {
    const companiesSnap = await db.collection("companies").get();

    for (const companyDoc of companiesSnap.docs) {
      const company = companyDoc.data() as {
        attendanceRules?: { autoClockOut?: boolean };
        businessHours?: { close?: string };
      };

      if (!company.attendanceRules?.autoClockOut) continue;

      const closeTimeStr = company.businessHours?.close ?? "17:00";
      const [closeH, closeM] = closeTimeStr.split(":").map(Number);

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

      const latestByEmployee = new Map
        string,
        { type: string; timestamp: admin.firestore.Timestamp; siteId: string | null; siteName: string; employeeName: string }
      >();

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
        if (eventDate >= todayStart) return; // still today, not stale

        const closeTimestamp = new Date(eventDate);
        closeTimestamp.setHours(closeH, closeM, 0, 0);

        const newEventRef = companyDoc.ref.collection("clockEvents").doc();
        batch.set(newEventRef, {
          employeeId,
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
