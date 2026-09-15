import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "./shared";

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

export async function reservePinForEmployee(
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
// the caller's own batch finalizes it - see acceptInvite in company.ts.
export async function reserveNewPin(companyId: string): Promise<string> {
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
// (denormalized by onClockEventCreated in clockEvents.ts) so the app can
// determine current status (in/out/break) offline without a live
// Firestore query.
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
