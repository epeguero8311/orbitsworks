import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import {
  db,
  localDateKey,
  COMPANY_TIMEZONE,
  OVERRIDE_REASON_MIN_LENGTH,
  OVERRIDE_REASON_MAX_LENGTH,
} from "./shared";

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
    const isReasonedOverride =
      data.source === "supervisorOverride" &&
      typeof data.reason === "string" &&
      data.reason.length >= OVERRIDE_REASON_MIN_LENGTH &&
      data.reason.length <= OVERRIDE_REASON_MAX_LENGTH &&
      !!data.overrideEventId;

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
          ...(isReasonedOverride
            ? {
                flags: [
                  {
                    type: "SUPERVISOR_OVERRIDE",
                    severity: "info",
                    overrideEventId: data.overrideEventId,
                    // FieldValue.serverTimestamp() can't be used inside an
                    // array element, so this uses a concrete timestamp
                    // instead - it's set at function-execution time, which
                    // is effectively "now" on the server either way.
                    createdAt: admin.firestore.Timestamp.now(),
                  },
                ],
              }
            : {}),
        })
        .catch((err) => {
          console.error("Failed to create timesheetApproval for", event.params.eventId, err);
        });
    }

    // Supervisor overrides: upsert the shared overrideEvents doc for this
    // batch - arrayUnion on employeeIds is safe against out-of-order or
    // concurrent writes from the same multi-employee override batch, since
    // each ClockEvent in the batch carries the same overrideEventId. For a
    // clock-in, the timesheetApproval doc was just created above; any other
    // direction targets a session that's already open, so find that
    // session's clock-in event and flag its existing approval doc instead.
    if (isReasonedOverride) {
      const overrideEventId = data.overrideEventId as string;

      await db
        .collection("companies")
        .doc(companyId)
        .collection("overrideEvents")
        .doc(overrideEventId)
        .set(
          {
            companyId,
            siteId: data.siteId ?? null,
            siteName: data.siteName ?? "",
            supervisorId: data.authorizedById ?? null,
            supervisorName: data.authorizedByName ?? null,
            action: data.type,
            reason: data.reason,
            employeeIds: admin.firestore.FieldValue.arrayUnion(employeeId),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch((err) => {
          console.error("Failed to upsert overrideEvent", overrideEventId, err);
        });

      if (data.type !== "in") {
        const eventTs: admin.firestore.Timestamp =
          data.timestamp ?? admin.firestore.Timestamp.now();

        const openSessionSnap = await db
          .collection("companies")
          .doc(companyId)
          .collection("clockEvents")
          .where("employeeId", "==", employeeId)
          .where("type", "==", "in")
          .where("timestamp", "<", eventTs)
          .orderBy("timestamp", "desc")
          .limit(1)
          .get()
          .catch((err) => {
            console.error("Failed to find open session for override flag", employeeId, err);
            return null;
          });

        const clockInDoc =
          openSessionSnap && !openSessionSnap.empty ? openSessionSnap.docs[0] : null;

        if (clockInDoc) {
          await db
            .collection("companies")
            .doc(companyId)
            .collection("timesheetApprovals")
            .doc(clockInDoc.id)
            .update({
              flags: admin.firestore.FieldValue.arrayUnion({
                type: "SUPERVISOR_OVERRIDE",
                severity: "info",
                overrideEventId,
                createdAt: admin.firestore.Timestamp.now(),
              }),
            })
            .catch((err) => {
              console.error(
                "Failed to flag timesheetApproval for override",
                clockInDoc.id,
                err
              );
            });
        }
      }
    }
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
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
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
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
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
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
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

  function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hour, minute] = timeStr.split(":").map(Number);
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const asIfLocal = new Date(utcGuess.toLocaleString("en-US", { timeZone }));
    const offset = utcGuess.getTime() - asIfLocal.getTime();
    return new Date(utcGuess.getTime() + offset);
  }

  const toTimestamp = (time: string) =>
    admin.firestore.Timestamp.fromDate(zonedTimeToUtc(date, time, COMPANY_TIMEZONE));

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
