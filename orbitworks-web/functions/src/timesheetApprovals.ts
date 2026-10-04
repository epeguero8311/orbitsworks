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

// The Job dropdown on the Approvals row only gets written to the approval
// doc at the moment a row is approved - toggling back to pending never
// touches it, so the picked job survives a pending<->approved toggle.
// jobId undefined means the caller didn't send one (leave the field alone);
// null or "" means "(Default)" was picked (clear it); a real id resolves
// the job's current name so the stored pair stays accurate even if the Job
// gets renamed later.
async function resolveJobFields(
  companyId: string,
  status: "pending" | "approved",
  jobId: string | null | undefined
): Promise<Record<string, unknown>> {
  if (status !== "approved" || jobId === undefined) return {};
  if (!jobId) {
    return { jobId: null, jobName: admin.firestore.FieldValue.delete() };
  }
  const jobSnap = await db.collection("companies").doc(companyId).collection("jobs").doc(jobId).get();
  if (!jobSnap.exists) {
    return { jobId: null, jobName: admin.firestore.FieldValue.delete() };
  }
  const jobData = jobSnap.data() as { name?: string };
  return { jobId, jobName: jobData.name ?? null };
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
  const jobId: string | null | undefined =
    request.data && "jobId" in request.data
      ? request.data.jobId == null
        ? null
        : String(request.data.jobId)
      : undefined;
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
  const jobFields = await resolveJobFields(callerCompanyId, status, jobId);
  await approvalRef.update({
    ...statusUpdateFields(status, request.auth.uid, approvedByName),
    ...jobFields,
  });

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
  const jobIdByEventIdRaw: Record<string, unknown> =
    request.data && typeof request.data.jobIdByEventId === "object" && request.data.jobIdByEventId
      ? request.data.jobIdByEventId
      : {};
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
  const statusFields = statusUpdateFields(status, request.auth.uid, approvedByName);

  // Each row can have picked a different Job, so job fields are resolved
  // per event rather than once for the whole batch.
  const jobFieldsByEventId = new Map<string, Record<string, unknown>>();
  await Promise.all(
    eventIds.map(async (eventId) => {
      const jobId = eventId in jobIdByEventIdRaw
        ? jobIdByEventIdRaw[eventId] == null
          ? null
          : String(jobIdByEventIdRaw[eventId])
        : undefined;
      jobFieldsByEventId.set(eventId, await resolveJobFields(callerCompanyId, status, jobId));
    })
  );

  const batch = db.batch();
  approvalRefs.forEach((ref, i) => {
    const eventId = eventIds[i];
    const healData = healDataByEventId.get(eventId);
    const updateFields = { ...statusFields, ...jobFieldsByEventId.get(eventId) };
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
