import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db, localDateKey } from "./shared";

// Firestore batch writes cap at 500 operations - each approval here is one
// write, so this is also the max number of rows a single bulk-approve call
// can cover.
const MAX_BULK_APPROVALS = 500;

async function resolveApprovedByName(uid: string): Promise<string> {
  const callerSnap = await db.collection("users").doc(uid).get();
  if (callerSnap.exists) {
    const callerData = callerSnap.data() as { name?: string };
    if (callerData.name) return callerData.name;
  }
  return "Admin";
}

// Self-heal: the approval doc is normally created by onClockEventCreated
// right after the clock-in event, but that trigger is async and can lag
// behind a fast Approve click (or fail silently - it swallows its own
// errors). eventId IS the clock-in event's id, so we can rebuild the
// approval doc from that event directly instead of failing here.
async function buildSelfHealData(
  callerCompanyId: string,
  eventId: string
): Promise<Record<string, unknown> | null> {
  const eventRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("clockEvents")
    .doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) return null;

  const eventData = eventSnap.data() as {
    employeeId?: string;
    employeeName?: string;
    siteId?: string | null;
    siteName?: string;
    timestamp?: admin.firestore.Timestamp;
    type?: string;
  };
  if (eventData.type !== "in") return null;

  const ts: Date = eventData.timestamp ? eventData.timestamp.toDate() : new Date();
  return {
    employeeId: eventData.employeeId ?? "",
    employeeName: eventData.employeeName ?? "",
    date: localDateKey(ts),
    siteId: eventData.siteId ?? null,
    siteName: eventData.siteName ?? "",
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function statusUpdateFields(
  status: "pending" | "approved",
  callerUid: string,
  approvedByName: string
): Record<string, unknown> {
  if (status === "approved") {
    return {
      status: "approved",
      approvedByUid: callerUid,
      approvedByName,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
  }
  return {
    status: "pending",
    approvedByUid: admin.firestore.FieldValue.delete(),
    approvedByName: admin.firestore.FieldValue.delete(),
    approvedAt: admin.firestore.FieldValue.delete(),
  };
}

// Simple pending <-> approved toggle on a session's timesheetApproval doc,
// keyed by that session's clock-in eventId. No reopen-with-reason gate -
// the admin agreed a plain toggle is enough here.
export const setApprovalStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
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
    const healData = await buildSelfHealData(callerCompanyId, eventId);
    if (!healData) {
      throw new HttpsError("not-found", "Timesheet approval not found.");
    }
    await approvalRef.set(healData);
  }

  const approvedByName = status === "approved" ? await resolveApprovedByName(request.auth.uid) : "";
  await approvalRef.update(statusUpdateFields(status, request.auth.uid, approvedByName));

  return { success: true };
});

// Same toggle as setApprovalStatus, but for many sessions at once - the
// Approvals table's "Approve All" action on a bulk selection. Every
// approval doc is written in a single Firestore batch so the set either
// all lands or none does, instead of N independent calls that could
// partially fail under load.
export const setApprovalStatusBulk = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const eventIds: string[] = Array.isArray(request.data?.eventIds)
    ? Array.from(new Set(request.data.eventIds.map((id: unknown) => String(id))))
    : [];
  const status = request.data && request.data.status;
  if (eventIds.length === 0 || (status !== "pending" && status !== "approved")) {
    throw new HttpsError("invalid-argument", "eventIds and a valid status are required.");
  }
  if (eventIds.length > MAX_BULK_APPROVALS) {
    throw new HttpsError(
      "invalid-argument",
      `Cannot update more than ${MAX_BULK_APPROVALS} rows at once.`
    );
  }

  const approvalsRef = db.collection("companies").doc(callerCompanyId).collection("timesheetApprovals");
  const approvalRefs = eventIds.map((id) => approvalsRef.doc(id));
  const approvalSnaps = await Promise.all(approvalRefs.map((ref) => ref.get()));

  const healDataByEventId = new Map<string, Record<string, unknown>>();
  await Promise.all(
    approvalSnaps.map(async (snap, i) => {
      if (snap.exists) return;
      const healData = await buildSelfHealData(callerCompanyId, eventIds[i]);
      if (!healData) {
        throw new HttpsError("not-found", `Timesheet approval not found for event ${eventIds[i]}.`);
      }
      healDataByEventId.set(eventIds[i], healData);
    })
  );

  const approvedByName = status === "approved" ? await resolveApprovedByName(request.auth.uid) : "";
  const updateFields = statusUpdateFields(status, request.auth.uid, approvedByName);

  const batch = db.batch();
  approvalRefs.forEach((ref, i) => {
    const eventId = eventIds[i];
    const healData = healDataByEventId.get(eventId);
    if (healData) {
      batch.set(ref, { ...healData, ...updateFields });
    } else {
      batch.update(ref, updateFields);
    }
  });
  await batch.commit();

  return { success: true, count: eventIds.length };
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
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
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
