import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const FREE_EMPLOYEE_CAP = 8;

// Matches the timezone autoClockOutStaleSessions already uses for its
// schedule. Cloud Functions' runtime clock reads in UTC by default, so
// computing a "which calendar day is this" date key with raw
// Date.getFullYear()/getMonth()/getDate() silently shifts any evening
// event (e.g. after ~7 PM Central) onto the next day once UTC crosses
// midnight. That mismatch broke timesheetApprovals lookups: a session
// added for "today" could get stamped with tomorrow's date, so it never
// showed up (or couldn't be approved) on the day the admin actually
// picked. This helper fixes the day boundary to a real timezone instead
// of the server's own clock.
const COMPANY_TIMEZONE = "America/Chicago";

function localDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

async function deactivateEmployeeAuth(linkedUserId: string) {
  await admin.auth().updateUser(linkedUserId, { disabled: true });
  await admin.auth().revokeRefreshTokens(linkedUserId);
}

// --- PIN uniqueness (server-side, transactional) ---
//
// companies/{companyId}/pins/{pin} is a reservation index: doc ID is the
// PIN itself, so two concurrent transactions can never both "win" the same
// PIN - Firestore's transaction commit protocol rejects the loser and it
// retries with fresh reads. This is what actually closes the race
// condition that a client-side "query existing pins, then write" can
// never guarantee to close. { employeeId } on each reservation doc
// records who holds it; employeeId: null marks a pin claimed-but-not-yet-
// assigned (used only by reserveNewPin, for the moment between claiming a
// pin and the caller's own batch finishing employee creation).

async function reservePinForEmployee(
  companyId: string,
  employeeId: string,
  desiredPin: string | null
): Promise<string> {
  const employeeRef = db.collection("companies").doc(companyId).collection("employees").doc(employeeId);
  const pinsRef = db.collection("companies").doc(companyId).collection("pins");
  const maxAttempts = desiredPin ? 1 : 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = desiredPin ?? Math.floor(1000 + Math.random() * 9000).toString();
    const candidateRef = pinsRef.doc(candidate);

    const taken = await db.runTransaction(async (tx) => {
      const employeeSnap = await tx.get(employeeRef);
      if (!employeeSnap.exists) {
        throw new HttpsError("not-found", "Employee not found.");
      }
      const employee = employeeSnap.data() as { pin?: string };
      const oldPin = employee.pin ?? null;

      if (oldPin === candidate) {
        return false;
      }

      const candidateSnap = await tx.get(candidateRef);
      if (candidateSnap.exists) {
        const holder = candidateSnap.data() as { employeeId?: string | null };
        if (holder.employeeId && holder.employeeId !== employeeId) {
          return true;
        }
      }

      if (oldPin) {
        tx.delete(pinsRef.doc(oldPin));
      }
      tx.set(candidateRef, {
        employeeId,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      tx.update(employeeRef, { pin: candidate });
      return false;
    });

    if (!taken) {
      return candidate;
    }
    if (desiredPin) {
      throw new HttpsError("already-exists", "That PIN is already assigned to another employee.");
    }
    // auto-generate mode - loop and try a different random candidate
  }

  throw new HttpsError("resource-exhausted", "Could not generate a unique PIN. Try again.");
}

// Claims a PIN for an employee that does not exist yet (acceptInvite
// creates the employee doc in a batch immediately after this call, using
// the returned PIN). Reserves with employeeId: null as a placeholder;
// the caller's own batch finalizes it - see acceptInvite below.
async function reserveNewPin(companyId: string): Promise<string> {
  const pinsRef = db.collection("companies").doc(companyId).collection("pins");
  const maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = Math.floor(1000 + Math.random() * 9000).toString();
    const candidateRef = pinsRef.doc(candidate);

    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(candidateRef);
      if (snap.exists) return false;
      tx.set(candidateRef, {
        employeeId: null,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      return true;
    });

    if (claimed) return candidate;
  }

  throw new HttpsError("resource-exhausted", "Could not generate a unique PIN. Try again.");
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

export const setEmployeePin = onCall(async (request) => {
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

  const rawPin =
    request.data && request.data.pin !== undefined && request.data.pin !== null
      ? String(request.data.pin).trim()
      : null;

  if (rawPin !== null && !/^\d{4}$/.test(rawPin)) {
    throw new HttpsError("invalid-argument", "PIN must be exactly 4 digits.");
  }

  const pin = await reservePinForEmployee(callerCompanyId, employeeId, rawPin);
  return { success: true, pin };
});

// Migration/repair utility: builds the pins/{pin} uniqueness index for
// employees who already have a PIN (that index does not exist for data
// created before this reservation system was added), fixes any duplicate
// PINs that slipped through under the old client-side-only check by
// reassigning a fresh PIN to whichever employee loses the collision, and
// assigns a brand new PIN to anyone missing one entirely. Idempotent -
// safe to run more than once.
export const backfillEmployeePins = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if (callerRole !== "admin" || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const employeesRef = db.collection("companies").doc(callerCompanyId).collection("employees");
  const pinsRef = db.collection("companies").doc(callerCompanyId).collection("pins");
  const employeesSnap = await employeesRef.get();

  // Stable order so that if a duplicate PIN already exists in the data,
  // the same employee consistently "wins" it on every run.
  const sortedDocs = [...employeesSnap.docs].sort((a, b) => a.id.localeCompare(b.id));

  let reservedExisting = 0;
  let conflictsFixed = 0;
  let backfilled = 0;

  for (const employeeDoc of sortedDocs) {
    const employee = employeeDoc.data() as { pin?: string };
    const pin = employee.pin;
    if (!pin || !/^\d{4}$/.test(pin)) continue;

    const pinRef = pinsRef.doc(pin);
    const claimed = await db.runTransaction(async (tx) => {
      const pinSnap = await tx.get(pinRef);
      if (pinSnap.exists) {
        const holder = pinSnap.data() as { employeeId?: string | null };
        if (holder.employeeId && holder.employeeId !== employeeDoc.id) {
          return false;
        }
        return true;
      }
      tx.set(pinRef, {
        employeeId: employeeDoc.id,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      return true;
    });

    if (claimed) {
      reservedExisting++;
    } else {
      await reservePinForEmployee(callerCompanyId, employeeDoc.id, null);
      conflictsFixed++;
    }
  }

  for (const employeeDoc of sortedDocs) {
    const employee = employeeDoc.data() as { pin?: string };
    const pin = employee.pin;
    if (pin && /^\d{4}$/.test(pin)) continue;
    await reservePinForEmployee(callerCompanyId, employeeDoc.id, null);
    backfilled++;
  }

  return { success: true, reservedExisting, conflictsFixed, backfilled };
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
        subcontractorId: data.subcontractorId ?? null,
        subcontractorName: data.subcontractorName ?? null,
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

    // Every new clock-in starts a session that needs admin review before
    // it can appear in an approved Excel export. Only fires for
    // type == "in" - breakStart/breakEnd/out belong to a session whose
    // approval doc was already created when that session's "in" fired.
    // NOTE: date is derived from the function's server timezone, same
    // simplification autoClockOutStaleSessions already makes - a clock-in
    // right around midnight could land on the "wrong" date row.
    if (data.type === "in") {
      const ts: Date = data.timestamp ? data.timestamp.toDate() : new Date();
      const dateKey = localDateKey(ts);

      await db
        .collection("companies")
        .doc(companyId)
        .collection("timesheetApprovals")
        .doc(event.params.eventId)
        .set({
          employeeId,
          employeeName: data.employeeName ?? "",
          date: dateKey,
          siteId: data.siteId ?? null,
          siteName: data.siteName ?? "",
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        .catch((err) => {
          console.error("Failed to create timesheetApproval for", event.params.eventId, err);
        });
    }
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

export const correctClockEvent = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if (callerRole !== "admin" || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const eventId = (request.data && request.data.eventId ? String(request.data.eventId) : "").trim();
  const newTimestampMs = request.data && typeof request.data.newTimestamp === "number"
    ? request.data.newTimestamp
    : null;
  const reason = request.data && typeof request.data.reason === "string"
    ? request.data.reason.trim()
    : undefined;

  if (!eventId) {
    throw new HttpsError("invalid-argument", "eventId is required.");
  }
  if (newTimestampMs === null || !Number.isFinite(newTimestampMs)) {
    throw new HttpsError("invalid-argument", "newTimestamp is required and must be a number (epoch ms).");
  }

  const eventRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("clockEvents")
    .doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    throw new HttpsError("not-found", "Clock event not found.");
  }
  const event = eventSnap.data() as {
    timestamp?: admin.firestore.Timestamp;
    adjustedTimestamp?: admin.firestore.Timestamp;
    adjustmentHistory?: Array<Record<string, unknown>>;
  };

  const previousValue = event.adjustedTimestamp ?? event.timestamp;
  if (!previousValue) {
    throw new HttpsError("failed-precondition", "Clock event has no existing timestamp to correct.");
  }

  const newTimestamp = admin.firestore.Timestamp.fromMillis(newTimestampMs);

  let changedByName = "Admin";
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  if (callerSnap.exists) {
    const callerData = callerSnap.data() as { name?: string };
    if (callerData.name) {
      changedByName = callerData.name;
    }
  }

  const adjustment = {
    fieldChanged: "timestamp",
    previousValue,
    newValue: newTimestamp,
    changedByUid: request.auth.uid,
    changedByName,
    changedAt: admin.firestore.Timestamp.now(),
    ...(reason ? { reason } : {}),
  };

  await eventRef.update({
    adjustedTimestamp: newTimestamp,
    adjustmentHistory: admin.firestore.FieldValue.arrayUnion(adjustment),
  });

  return { success: true };
});

export const reassignClockEvent = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if (callerRole !== "admin" || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const eventId = (request.data && request.data.eventId ? String(request.data.eventId) : "").trim();
  const newEmployeeId = (request.data && request.data.newEmployeeId ? String(request.data.newEmployeeId) : "").trim();
  const reason = request.data && typeof request.data.reason === "string"
    ? request.data.reason.trim()
    : undefined;

  if (!eventId) {
    throw new HttpsError("invalid-argument", "eventId is required.");
  }
  if (!newEmployeeId) {
    throw new HttpsError("invalid-argument", "newEmployeeId is required.");
  }

  const eventRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("clockEvents")
    .doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    throw new HttpsError("not-found", "Clock event not found.");
  }
  const event = eventSnap.data() as {
    employeeId?: string;
    employeeName?: string;
    adjustmentHistory?: Array<Record<string, unknown>>;
  };

  if (event.employeeId === newEmployeeId) {
    throw new HttpsError("failed-precondition", "Event is already assigned to that employee.");
  }

  const newEmployeeRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("employees")
    .doc(newEmployeeId);
  const newEmployeeSnap = await newEmployeeRef.get();
  if (!newEmployeeSnap.exists) {
    throw new HttpsError("not-found", "Target employee not found.");
  }
  const newEmployee = newEmployeeSnap.data() as {
    name?: string;
    active?: boolean;
    subcontractorId?: string | null;
    subcontractorName?: string | null;
  };
  if (!newEmployee.active) {
    throw new HttpsError("failed-precondition", "Target employee is not active.");
  }

  let changedByName = "Admin";
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  if (callerSnap.exists) {
    const callerData = callerSnap.data() as { name?: string };
    if (callerData.name) {
      changedByName = callerData.name;
    }
  }

  const adjustment = {
    fieldChanged: "employeeId",
    previousValue: event.employeeName ?? "Unknown",
    newValue: newEmployee.name ?? "Unknown",
    changedByUid: request.auth.uid,
    changedByName,
    changedAt: admin.firestore.Timestamp.now(),
    ...(reason ? { reason } : {}),
  };

  // Reassigning an event to a different employee also re-snapshots
  // that employee's current subcontractor onto the event. This keeps
  // subcontractor payroll reports correct: the event should follow
  // whichever company the *new* employee belongs to, not whatever the
  // original employee's company was.
  await eventRef.update({
    employeeId: newEmployeeId,
    employeeName: newEmployee.name ?? "Unknown",
    subcontractorId: newEmployee.subcontractorId ?? null,
    subcontractorName: newEmployee.subcontractorName ?? null,
    adjustmentHistory: admin.firestore.FieldValue.arrayUnion(adjustment),
  });

  return { success: true };
});

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
// Admin creates a full missing session (in/out, optional break) for a day
// that has zero clock events at all. Writing the "in" event triggers
// onClockEventCreated above, which auto-creates the pending
// timesheetApproval - no separate approval-doc logic needed here.
export const addManualTimestamp = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if (callerRole !== "admin" || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const d = request.data ?? {};
  const employeeId = (d.employeeId ? String(d.employeeId) : "").trim();
  const date = (d.date ? String(d.date) : "").trim();
  const clockInTime = (d.clockInTime ? String(d.clockInTime) : "").trim();
  const clockOutTime = (d.clockOutTime ? String(d.clockOutTime) : "").trim();
  const breakStartTime = d.breakStartTime ? String(d.breakStartTime).trim() : null;
  const breakEndTime = d.breakEndTime ? String(d.breakEndTime).trim() : null;
  const siteId = d.siteId ? String(d.siteId) : null;
  const reason = (d.reason ? String(d.reason) : "").trim();

  // Company override is optional and tri-state: key absent -> use the
  // employee's current subcontractor assignment (old behavior); key
  // present with a string -> attribute this session to that
  // subcontractor; key present as null/"" -> attribute to the main
  // company regardless of the employee's current assignment.
  const hasCompanyOverride = Object.prototype.hasOwnProperty.call(d, "subcontractorId");
  const subcontractorIdOverride = hasCompanyOverride
    ? (d.subcontractorId ? String(d.subcontractorId) : null)
    : undefined;

  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError("invalid-argument", "employeeId and a valid date are required.");
  }
  if (!/^\d{2}:\d{2}$/.test(clockInTime) || !/^\d{2}:\d{2}$/.test(clockOutTime)) {
    throw new HttpsError("invalid-argument", "Clock in/out times must be HH:MM.");
  }
  if (clockOutTime <= clockInTime) {
    throw new HttpsError("invalid-argument", "Clock out must be after clock in.");
  }
  if ((breakStartTime && !breakEndTime) || (!breakStartTime && breakEndTime)) {
    throw new HttpsError("invalid-argument", "Break start and end must both be provided or both omitted.");
  }
  if (breakStartTime && breakEndTime && breakEndTime <= breakStartTime) {
    throw new HttpsError("invalid-argument", "Break end must be after break start.");
  }
  if (!reason) {
    throw new HttpsError("invalid-argument", "Reason is required.");
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
    name?: string;
    subcontractorId?: string | null;
    subcontractorName?: string | null;
  };

  let sessionSubcontractorId = employee.subcontractorId ?? null;
  let sessionSubcontractorName = employee.subcontractorName ?? null;
  if (hasCompanyOverride) {
    if (subcontractorIdOverride) {
      const subSnap = await db
        .collection("companies")
        .doc(callerCompanyId)
        .collection("subcontractors")
        .doc(subcontractorIdOverride)
        .get();
      sessionSubcontractorId = subcontractorIdOverride;
      sessionSubcontractorName = subSnap.exists
        ? (subSnap.data() as { name?: string }).name ?? null
        : null;
    } else {
      sessionSubcontractorId = null;
      sessionSubcontractorName = null;
    }
  }

  let siteName = "";
  if (siteId) {
    const siteSnap = await db
      .collection("companies")
      .doc(callerCompanyId)
      .collection("jobSites")
      .doc(siteId)
      .get();
    if (siteSnap.exists) {
      siteName = (siteSnap.data() as { name?: string }).name ?? "";
    }
  }

  const toTimestamp = (time: string) =>
    admin.firestore.Timestamp.fromDate(new Date(`${date}T${time}:00`));

  const base = {
    employeeId,
    employeeName: employee.name ?? "",
    siteId,
    siteName,
    source: "adminManual" as const,
    note: reason,
    createdByUid: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    subcontractorId: sessionSubcontractorId,
    subcontractorName: sessionSubcontractorName,
  };

  const eventsRef = db.collection("companies").doc(callerCompanyId).collection("clockEvents");
  const batch = db.batch();

  batch.set(eventsRef.doc(), { ...base, type: "in", timestamp: toTimestamp(clockInTime) });
  if (breakStartTime && breakEndTime) {
    batch.set(eventsRef.doc(), { ...base, type: "breakStart", timestamp: toTimestamp(breakStartTime) });
    batch.set(eventsRef.doc(), { ...base, type: "breakEnd", timestamp: toTimestamp(breakEndTime) });
  }
  batch.set(eventsRef.doc(), { ...base, type: "out", timestamp: toTimestamp(clockOutTime) });

  await batch.commit();

  return { success: true };
});

// Simple pending <-> approved toggle on a session's timesheetApproval doc,
// keyed by that session's clock-in eventId. No reopen-with-reason gate -
// the admin agreed a plain toggle is enough here.
export const setApprovalStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if (callerRole !== "admin" || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const eventId = (request.data && request.data.eventId ? String(request.data.eventId) : "").trim();
  const status = request.data && request.data.status;
  if (!eventId || (status !== "pending" && status !== "approved")) {
    throw new HttpsError("invalid-argument", "eventId and a valid status are required.");
  }

  const approvalRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("timesheetApprovals")
    .doc(eventId);
  const approvalSnap = await approvalRef.get();

  if (!approvalSnap.exists) {
    // Self-heal: the approval doc is normally created by onClockEventCreated
    // right after the clock-in event, but that trigger is async and can lag
    // behind a fast Approve click (or fail silently - it swallows its own
    // errors). eventId IS the clock-in event's id, so we can rebuild the
    // approval doc from that event directly instead of failing here.
    const eventRef = db
      .collection("companies")
      .doc(callerCompanyId)
      .collection("clockEvents")
      .doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      throw new HttpsError("not-found", "Timesheet approval not found.");
    }
    const eventData = eventSnap.data() as {
      employeeId?: string;
      employeeName?: string;
      siteId?: string | null;
      siteName?: string;
      timestamp?: admin.firestore.Timestamp;
      type?: string;
    };
    if (eventData.type !== "in") {
      throw new HttpsError("not-found", "Timesheet approval not found.");
    }
    const ts: Date = eventData.timestamp ? eventData.timestamp.toDate() : new Date();
    const dateKeyStr = localDateKey(ts);
    await approvalRef.set({
      employeeId: eventData.employeeId ?? "",
      employeeName: eventData.employeeName ?? "",
      date: dateKeyStr,
      siteId: eventData.siteId ?? null,
      siteName: eventData.siteName ?? "",
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  if (status === "approved") {
    let approvedByName = "Admin";
    const callerSnap = await db.collection("users").doc(request.auth.uid).get();
    if (callerSnap.exists) {
      const callerData = callerSnap.data() as { name?: string };
      if (callerData.name) approvedByName = callerData.name;
    }
    await approvalRef.update({
      status: "approved",
      approvedByUid: request.auth.uid,
      approvedByName,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await approvalRef.update({
      status: "pending",
      approvedByUid: admin.firestore.FieldValue.delete(),
      approvedByName: admin.firestore.FieldValue.delete(),
      approvedAt: admin.firestore.FieldValue.delete(),
    });
  }

  return { success: true };
});

// Deletes an entire work session (clock-in, optional break events, clock-out)
// plus its timesheetApproval doc, in one batch. eventIds must be the exact
// event ids that make up the session - the client already has these from
// pairing the events for display, so the server doesn't need to re-derive
// session boundaries itself. approvalId is the clock-in event's id (how
// timesheetApprovals docs are keyed). Irreversible - the modal confirming
// this on the client should make that unmistakable before calling.
export const deleteTimesheetSession = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if (callerRole !== "admin" || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const eventIds: string[] = Array.isArray(request.data?.eventIds)
    ? request.data.eventIds.map((id: unknown) => String(id))
    : [];
  const approvalId = (request.data && request.data.approvalId ? String(request.data.approvalId) : "").trim();

  if (eventIds.length === 0 || !approvalId) {
    throw new HttpsError("invalid-argument", "eventIds and approvalId are required.");
  }

  const eventsRef = db.collection("companies").doc(callerCompanyId).collection("clockEvents");
  const approvalRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("timesheetApprovals")
    .doc(approvalId);

  // Verify every event actually belongs to this company before deleting
  // anything - a batch has no read-then-check, so this happens up front.
  const eventSnaps = await Promise.all(eventIds.map((id) => eventsRef.doc(id).get()));
  const missing = eventSnaps.filter((snap) => !snap.exists);
  if (missing.length > 0) {
    throw new HttpsError("not-found", "One or more clock events in this session were not found.");
  }

  const batch = db.batch();
  eventIds.forEach((id) => batch.delete(eventsRef.doc(id)));
  batch.delete(approvalRef);
  await batch.commit();

  return { success: true };
});
