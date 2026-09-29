import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, type FirestoreEvent } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineBoolean } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  db,
  localDateKey,
  COMPANY_TIMEZONE,
  OVERRIDE_REASON_MIN_LENGTH,
  OVERRIDE_REASON_MAX_LENGTH,
} from "./shared";
import { MAPBOX_TOKEN, haversineMeters, reverseGeocode } from "./geocoding";
import { classifyGeofence, detectSite, DetectableSite, GeofenceStatus } from "./geofencing";

// Duplicated from lib/stripe/tiers.ts's isProPlan - see geocoding.ts for
// why this can't just be imported.
function isProPlan(planTier: string | undefined | null): boolean {
  return !!planTier && planTier.startsWith("pro_");
}

// Device Recognition Pro - dark-launched, default OFF. While false, every
// clock event is processed exactly as it is today; handleDeviceTracking
// below returns immediately, before reading or writing anything. Flip
// only after both the rules and this function are deployed.
export const DEVICE_TRACKING_ENABLED = defineBoolean("DEVICE_TRACKING_ENABLED", { default: false });

const DEVICE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Device Recognition Pro. Stamps lastSeenAt/lastUserUid onto an EXISTING,
// already-named device doc (mobile Settings / web Devices name it first -
// see firestore.rules' devices/{deviceId} create rule) so the UI can show
// "last used by". Never creates a device doc for an unnamed device, and
// never touches the clock event itself - this is purely a side write for
// the device's own doc, kept fully isolated from the geofencing/approvals
// logic above. Every input here is untrusted (old app versions, other
// event sources, and non-Pro companies never send a usable deviceId), so
// every check below is a silent skip, not a throw - and the one try/catch
// wrapping all of it means a malformed field, a missing company doc, or a
// transaction conflict can never make the clock event itself fail to
// process, flag on or off.
async function handleDeviceTracking(
  event: FirestoreEvent<admin.firestore.QueryDocumentSnapshot | undefined, { companyId: string; eventId: string }>
): Promise<void> {
  const companyId = event.params?.companyId;
  const eventId = event.params?.eventId;
  try {
    if (!DEVICE_TRACKING_ENABLED.value()) return;

    const data = event.data?.data();
    if (!data || !companyId) return;

    const deviceId = data.deviceId;
    if (typeof deviceId !== "string" || !DEVICE_ID_REGEX.test(deviceId)) return;

    // "pin" is the real app's normal PIN+photo clock-in source; faceMatch
    // is kept for forward compatibility even though nothing sends it today.
    const source = data.source;
    if (source !== "faceMatch" && source !== "supervisorOverride" && source !== "pin") return;

    const eventTimestamp = data.timestamp;
    // Modular Timestamp import, not admin.firestore.Timestamp - the
    // namespaced static comes back undefined inside the Functions
    // Emulator (firebase-admin/firebase-tools compat-layer bug local to
    // emulation; unaffected in deployed Cloud Functions).
    if (!(eventTimestamp instanceof Timestamp)) return;

    const companySnap = await db.collection("companies").doc(companyId).get();
    if (!isProPlan(companySnap.data()?.planTier as string | undefined)) return;

    const deviceRef = db
      .collection("companies")
      .doc(companyId)
      .collection("devices")
      .doc(deviceId);

    await db.runTransaction(async (tx) => {
      const deviceSnap = await tx.get(deviceRef);
      if (!deviceSnap.exists) return;

      const existing = deviceSnap.data() as { lastSeenAt?: admin.firestore.Timestamp } | undefined;
      if (existing?.lastSeenAt && existing.lastSeenAt.toMillis() >= eventTimestamp.toMillis()) {
        return;
      }

      tx.update(deviceRef, {
        lastSeenAt: eventTimestamp,
        lastUserUid: (data.createdByUid as string | undefined) ?? null,
      });
    });
  } catch (err) {
    console.warn("Device tracking failed for clock event", eventId, companyId, err);
  }
}

// Keeps employees/{employeeId}.lastEventType in sync with the most
// recent clock event, so getPinSyncTable can hand the mobile app a
// current-status snapshot without a separate per-employee query. This
// is what lets the app determine in/out/break offline.
export const onClockEventCreated = onDocumentCreated(
  { document: "companies/{companyId}/clockEvents/{eventId}", secrets: [MAPBOX_TOKEN] },
  async (event) => {
    const data = event.data?.data();
    if (!data || !data.employeeId) return;

    const companyId = event.params.companyId;
    const employeeId = data.employeeId as string;
    const employeesRef = db.collection("companies").doc(companyId).collection("employees");
    const jobSitesRef = db.collection("companies").doc(companyId).collection("jobSites");

    // Geolocation (Pro): data.location is only ever a raw {lat,lng}/null at
    // write time (mobile app / temp link) - the client never resolves an
    // address, a distance, a geofence classification, or (new, auto site
    // detection) the site itself - that would let a tampered client just
    // claim "inside" or pick whichever site it likes. Only Pro companies'
    // clients are ever wired up to attempt a location fix at all, so
    // `location` is omitted entirely (not even null) for a Core company's
    // event - checking that key, rather than the company's plan, is what
    // lets this skip a company-doc read for the common Core case instead of
    // spending one on every single clock event.
    //
    // Admin manual entries (source: "adminManual") are exempt from
    // geofencing entirely, not just enforcement - there's no real GPS fix
    // to compare for one, so labeling it "outside" would be misleading.
    const locationAttempted = data.source !== "adminManual" && data.location !== undefined;
    let companyIsPro = false;
    if (locationAttempted) {
      const companySnap = await db.collection("companies").doc(companyId).get();
      companyIsPro = isProPlan(companySnap.data()?.planTier as string | undefined);
    }

    // Auto site detection (Pro) - only the mobile app's own clock-in/out
    // (source "pin") ever has an ambiguous site to resolve; a temp link's
    // site is fixed at link-generation time (tempClockLinks.ts) and is
    // never auto-detected, and a supervisor override's site is whatever the
    // supervisor picked. resolvedSiteId stays undefined ("leave the
    // client's siteId alone") whenever detection doesn't apply at all - a
    // Core company, a Pro company with zero fenced sites (both must "keep
    // today's flow exactly"), or a non-pin/non-in/out event.
    const isPinInOrOut =
      companyIsPro && data.source === "pin" && (data.type === "in" || data.type === "out");

    let resolvedSiteId: string | null | undefined;
    let resolvedSiteName: string | null | undefined;
    let siteCorrected = false;
    let siteMismatch = false;
    let resolvedGeofenceApplicable = false;
    let resolvedGeofenceStatus: GeofenceStatus | null = null;
    let resolvedDistanceM: number | null = null;

    let employeeData:
      | { assignedSiteIds?: string[]; lastEventSiteId?: string | null; lastEventSiteName?: string }
      | undefined;

    if (isPinInOrOut) {
      const employeeSnap = await employeesRef.doc(employeeId).get();
      employeeData = employeeSnap.data() as typeof employeeData;

      const rawLocation = data.location as { lat: number; lng: number } | null;
      const accuracyM = (data.locationAccuracyM as number | null | undefined) ?? null;
      const clientSiteId = (data.siteId as string | null | undefined) ?? null;

      if (data.type === "in") {
        const sitesSnap = await jobSitesRef
          .where("requireGeofence", "==", true)
          .where("active", "==", true)
          .get();
        const candidates: DetectableSite[] = sitesSnap.docs.map((d) => {
          const s = d.data() as { name?: string; lat?: number; lng?: number; radiusMeters?: number };
          return {
            id: d.id,
            name: s.name ?? "",
            lat: s.lat,
            lng: s.lng,
            radiusMeters: s.radiusMeters,
            requireGeofence: true,
            active: true,
          };
        });

        const detection = detectSite(rawLocation, accuracyM, candidates);
        if (detection.hasFencedSites) {
          resolvedSiteId = detection.siteId;
          resolvedSiteName = detection.siteName;
          resolvedGeofenceApplicable = true;
          resolvedGeofenceStatus = detection.status;
          resolvedDistanceM = detection.distanceM;
          siteCorrected = resolvedSiteId !== clientSiteId;

          // Site mismatch (info-only, never blocks) - only meaningful when
          // the employee actually has assigned sites and a real site (not
          // "no match") was detected; "no site detected" gets its own
          // separate Approvals treatment instead of being a mismatch.
          const assignedSiteIds = employeeData?.assignedSiteIds ?? [];
          if (resolvedSiteId && assignedSiteIds.length > 0 && !assignedSiteIds.includes(resolvedSiteId)) {
            siteMismatch = true;
          }
        }
      } else {
        // type === "out": never re-detect - a clock-out always keeps the
        // clock-in's site (per spec), verified with a direct
        // classifyGeofence check against that one known site rather than a
        // fresh search. Searching again could otherwise land the clock-out
        // on a *different* fenced site than the one actually worked, if the
        // worker's last GPS fix happens to be closer to another fence on
        // their way out.
        const fencedSitesExist = await jobSitesRef
          .where("requireGeofence", "==", true)
          .where("active", "==", true)
          .limit(1)
          .get();
        if (!fencedSitesExist.empty) {
          resolvedSiteId = employeeData?.lastEventSiteId ?? null;
          resolvedSiteName = employeeData?.lastEventSiteName ?? null;
          siteCorrected = resolvedSiteId !== clientSiteId;

          if (resolvedSiteId) {
            const siteSnap = await jobSitesRef.doc(resolvedSiteId).get();
            const site = siteSnap.data() as
              | { lat?: number; lng?: number; radiusMeters?: number }
              | undefined;
            const classification = classifyGeofence(rawLocation, accuracyM, {
              ...site,
              requireGeofence: true,
            });
            resolvedGeofenceApplicable = classification.applicable;
            resolvedGeofenceStatus = classification.status;
            resolvedDistanceM = classification.distanceM;
          }
        }
      }
    }

    const siteWasResolved = resolvedSiteId !== undefined;
    const finalSiteId = siteWasResolved ? resolvedSiteId : ((data.siteId as string | null | undefined) ?? null);
    const finalSiteName = siteWasResolved ? (resolvedSiteName ?? "") : ((data.siteName as string | undefined) ?? "");

    await employeesRef
      .doc(employeeId)
      .update({
        lastEventType: data.type,
        lastEventTimestamp: data.timestamp ?? admin.firestore.FieldValue.serverTimestamp(),
        lastEventSiteId: finalSiteId,
        lastEventSiteName: finalSiteName,
      })
      .catch(() => {
        // Employee doc may not exist in edge cases (e.g. deleted between
        // event write and this trigger firing) - safe to ignore, this
        // field is a denormalized convenience, not the source of truth.
      });

    if (siteWasResolved || resolvedGeofenceApplicable) {
      const eventUpdates: Record<string, unknown> = {};
      if (siteWasResolved) {
        eventUpdates.siteId = resolvedSiteId;
        eventUpdates.siteName = resolvedSiteName ?? "";
        eventUpdates.siteAutoDetected = true;
        if (siteCorrected) eventUpdates.siteCorrected = true;
        if (siteMismatch) eventUpdates.siteMismatch = true;
      }
      if (resolvedGeofenceApplicable) {
        eventUpdates.geofenceStatus = resolvedGeofenceStatus;
        eventUpdates.distanceFromSiteM = resolvedDistanceM;
      }
      await event.data!.ref.update(eventUpdates).catch((err) => {
        console.error("Failed to apply site resolution to clock event", event.params.eventId, err);
      });
    }

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
          siteId: finalSiteId,
          siteName: finalSiteName,
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

    // Reverse geocode the raw fix into a human-readable "near" address, and
    // (for anything the auto-detection resolution above didn't already
    // handle - temp link, supervisor override, or any other non-pin/
    // non-in-out source) fall back to the original single-site distance/
    // geofenceStatus lookup by whatever siteId the client wrote. Runs after
    // everything else above so a slow/failed geocode never delays the
    // timesheetApproval/overrideEvent writes those features depend on.
    if (locationAttempted && companyIsPro) {
      const rawLocation = data.location as { lat: number; lng: number } | null;
      const hasFix =
        !!rawLocation && typeof rawLocation.lat === "number" && typeof rawLocation.lng === "number";

      const updates: Record<string, unknown> = {};

      if (hasFix) {
        const { lat, lng } = rawLocation as { lat: number; lng: number };
        const locationAddress = await reverseGeocode(lat, lng);
        if (locationAddress) updates.locationAddress = locationAddress;
      }

      if (!isPinInOrOut) {
        const siteId = data.siteId as string | null | undefined;
        const siteSnap = siteId ? await jobSitesRef.doc(siteId).get() : null;
        const site = siteSnap?.data() as
          | { lat?: number; lng?: number; radiusMeters?: number; requireGeofence?: boolean }
          | undefined;

        if (hasFix) {
          const { lat, lng } = rawLocation as { lat: number; lng: number };
          let distanceFromSiteM: number | null = null;
          if (site && typeof site.lat === "number" && typeof site.lng === "number") {
            distanceFromSiteM = Math.round(haversineMeters(lat, lng, site.lat, site.lng));
          }
          updates.distanceFromSiteM = distanceFromSiteM;
        }

        const geofence = classifyGeofence(
          hasFix ? (rawLocation as { lat: number; lng: number }) : null,
          (data.locationAccuracyM as number | null | undefined) ?? null,
          site
        );
        if (geofence.applicable) {
          updates.geofenceStatus = geofence.status;
        }
      }

      if (Object.keys(updates).length > 0) {
        await event.data!.ref.update(updates).catch((err) => {
          console.error("Failed to enrich clock event location", event.params.eventId, err);
        });
      }
    }

    // Device Recognition Pro - runs last, fully isolated from everything
    // above. handleDeviceTracking never throws (its own try/catch
    // swallows everything), so this can never fail the trigger; the
    // extra .catch here is belt-and-suspenders against a future edit to
    // that function accidentally removing its internal guard.
    await handleDeviceTracking(event).catch(() => {});
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

// Admin/owner-only. Fixes a session whose clock-in resolved to "no job
// site detected" (auto-detection found no fenced site to match its
// location - see useTimesheetApprovals.ts's hasNoSiteDetectedWarning).
// Applies the chosen site to every event in the session (in/out/breaks
// alike, so they all agree) and recomputes each one's own
// geofenceStatus/distanceFromSiteM against its already-captured location,
// the same way onClockEventCreated would have. siteAutoDetected flips to
// false on every event - once an admin picks it, it isn't auto-detected
// anymore.
export const assignSessionSite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerRole = request.auth.token.role as string | undefined;
  const callerCompanyId = request.auth.token.companyId as string | undefined;
  if ((callerRole !== "admin" && callerRole !== "owner") || !callerCompanyId) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }

  const approvalId = (request.data?.approvalId ? String(request.data.approvalId) : "").trim();
  const eventIds = Array.isArray(request.data?.eventIds)
    ? (request.data.eventIds as unknown[]).map((id) => String(id)).filter(Boolean)
    : [];
  const siteId = (request.data?.siteId ? String(request.data.siteId) : "").trim();
  if (!approvalId) {
    throw new HttpsError("invalid-argument", "approvalId is required.");
  }
  if (eventIds.length === 0) {
    throw new HttpsError("invalid-argument", "eventIds is required.");
  }
  if (!siteId) {
    throw new HttpsError("invalid-argument", "siteId is required.");
  }

  const jobSitesRef = db.collection("companies").doc(callerCompanyId).collection("jobSites");
  const eventsRef = db.collection("companies").doc(callerCompanyId).collection("clockEvents");
  const approvalRef = db
    .collection("companies")
    .doc(callerCompanyId)
    .collection("timesheetApprovals")
    .doc(approvalId);

  const [siteSnap, approvalSnap] = await Promise.all([jobSitesRef.doc(siteId).get(), approvalRef.get()]);
  if (!siteSnap.exists) {
    throw new HttpsError("not-found", "Job site not found.");
  }
  if (!approvalSnap.exists) {
    throw new HttpsError("not-found", "Timesheet approval not found.");
  }
  const site = siteSnap.data() as {
    name?: string;
    lat?: number;
    lng?: number;
    radiusMeters?: number;
    requireGeofence?: boolean;
  };
  const siteName = site.name ?? "";

  const batch = db.batch();

  for (const eventId of eventIds) {
    const eventSnap = await eventsRef.doc(eventId).get();
    if (!eventSnap.exists) continue;
    const eventData = eventSnap.data() as {
      location?: { lat: number; lng: number } | null;
      locationAccuracyM?: number | null;
    };

    const updates: Record<string, unknown> = {
      siteId,
      siteName,
      siteAutoDetected: false,
    };

    const rawLocation = eventData.location ?? null;
    const hasFix =
      !!rawLocation && typeof rawLocation.lat === "number" && typeof rawLocation.lng === "number";
    const classification = classifyGeofence(
      hasFix ? (rawLocation as { lat: number; lng: number }) : null,
      eventData.locationAccuracyM ?? null,
      site
    );
    if (classification.applicable) {
      updates.geofenceStatus = classification.status;
      updates.distanceFromSiteM = classification.distanceM;
    }

    batch.update(eventsRef.doc(eventId), updates);
  }

  batch.update(approvalRef, { siteId, siteName });

  await batch.commit();
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
