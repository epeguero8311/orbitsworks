import * as FileSystem from "expo-file-system/legacy";
import { getDb } from "./db";
import { getCurrentLocalStatus } from "./clockStatusLocal";
import { notifyQueueChange } from "./queueEvents";
import { getOrCreateDeviceId, getCachedDeviceName } from "./deviceId";

export function makeLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function insertQueueItem(item) {
  const db = await getDb();
  // locationAttempted distinguishes "Geolocation ran but got no fix"
  // (item.location === null - a Pro company, permission denied or GPS
  // timeout) from "never attempted" (item.location === undefined - a
  // Core company, where callers never invoke getBestEffortLocation at
  // all). Both collapse to NULL lat/lng, so this flag is the only thing
  // that lets queueSync.js reproduce the right one server-side: the
  // former should show "Location not shared", the latter nothing.
  const locationAttempted = item.location !== undefined ? 1 : 0;
  // Device Recognition Pro - both reads are local-only (AsyncStorage), so
  // this never adds a network round trip to the clock-in path. deviceId is
  // get-or-create (always resolves once storage works at all); the name
  // is whatever useDeviceDoc.js last cached, null if never named or never
  // observed on this install.
  const deviceId = await getOrCreateDeviceId();
  const deviceNameSnapshot = deviceId ? await getCachedDeviceName() : null;
  await db.runAsync(
    `INSERT INTO event_queue
      (localId, employeeId, employeeName, siteId, siteName, type, photoLocalUri, note, source, authorizedById, authorizedByName, createdByUid, clientTimestamp, subcontractorId, subcontractorName, reason, overrideEventId, lat, lng, locationAccuracyM, locationAttempted, deviceId, deviceNameSnapshot, syncStatus, attempts, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    [
      item.localId,
      item.employeeId,
      item.employeeName,
      item.siteId ?? null,
      item.siteName ?? "Not specified",
      item.type,
      item.photoLocalUri ?? null,
      item.note ?? null,
      item.source ?? null,
      item.authorizedById ?? null,
      item.authorizedByName ?? null,
      item.createdByUid,
      item.clientTimestamp,
      item.subcontractorId ?? null,
      item.subcontractorName ?? null,
      item.reason ?? null,
      item.overrideEventId ?? null,
      item.location?.lat ?? null,
      item.location?.lng ?? null,
      item.location?.accuracyM ?? null,
      locationAttempted,
      deviceId,
      deviceNameSnapshot,
      item.createdAt,
    ]
  );
  // Any screen showing overlay-derived status should reflect this the
  // instant it happens, not on next focus - this is what makes offline
  // break/override/clock actions feel live instead of stale until nav.
  notifyQueueChange();
}

async function persistPhoto(photoUri, employeeId) {
  const dir = `${FileSystem.documentDirectory}clockPhotos/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}${employeeId}-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: photoUri, to: dest });
  return dest;
}

export async function queueClockEvent({
  employee,
  photoUri,
  source,
  createdByUid,
  siteId,
  siteName,
  location,
  reason,
}) {
  const currentStatus = await getCurrentLocalStatus(employee.id);
  const nextType = currentStatus === "out" ? "in" : "out";

  // findEmployeeByPinLocal now also resolves an inactive employee who
  // still has an open session, purely so they can be clocked OUT - never
  // back in. If they were somehow already out (a stale/incorrect cache
  // read), don't let this fall through to a new clock-in.
  if (nextType === "in" && employee.active === false) {
    // Tagged so ClockCameraScreen can route this to ClockDeclinedScreen
    // (a real decline, not a technical failure) rather than silently
    // resetting the button - see the Geofencing (Pro) declined-screen plan.
    const err = new Error("This employee has been deactivated and can no longer clock in.");
    err.code = "employeeDeactivated";
    throw err;
  }

  const persistedUri = await persistPhoto(photoUri, employee.id);
  const now = Date.now();

  if (currentStatus === "break" && nextType === "out") {
    await insertQueueItem({
      localId: makeLocalId(),
      employeeId: employee.id,
      employeeName: employee.name,
      siteId,
      siteName,
      type: "breakEnd",
      source: "autoBreakEnd",
      createdByUid,
      subcontractorId: employee.subcontractorId ?? null,
      subcontractorName: employee.subcontractorName ?? null,
      location,
      clientTimestamp: now - 1,
      createdAt: now,
    });
  }

  await insertQueueItem({
    localId: makeLocalId(),
    employeeId: employee.id,
    employeeName: employee.name,
    siteId,
    siteName,
    type: nextType,
    photoLocalUri: persistedUri,
    source,
    createdByUid,
    subcontractorId: employee.subcontractorId ?? null,
    subcontractorName: employee.subcontractorName ?? null,
    location,
    // Geofencing (Pro) Part 3 - only ever set on a clock-IN (nextType can
    // be "out" here too; a reason collected before this call was always
    // for the pending clock-in, never a clock-out, per spec). Harmless to
    // pass through on "out" too since callers never do.
    reason: nextType === "in" ? reason : undefined,
    clientTimestamp: now,
    createdAt: now,
  });

  return nextType;
}

export async function queueBreakEvent({ employee, type, createdByUid, authorizedBy, siteId, siteName, location }) {
  // An inactive employee can still end a break they were already on (part
  // of closing their session out), but never start a new one.
  if (type === "breakStart" && employee.active === false) {
    throw new Error("This employee has been deactivated and can no longer start a break.");
  }

  const now = Date.now();
  await insertQueueItem({
    localId: makeLocalId(),
    employeeId: employee.id,
    employeeName: employee.name,
    siteId,
    siteName,
    type,
    source: "supervisorPin",
    authorizedById: authorizedBy?.id ?? null,
    authorizedByName: authorizedBy?.name ?? null,
    createdByUid,
    subcontractorId: employee.subcontractorId ?? null,
    subcontractorName: employee.subcontractorName ?? null,
    location,
    clientTimestamp: now,
    createdAt: now,
  });
}

export async function queueOverrideClockIn({
  employee,
  createdByUid,
  authorizedBy,
  siteId,
  siteName,
  reason,
  overrideEventId,
  location,
}) {
  if (employee.active === false) {
    throw new Error("This employee has been deactivated and can no longer clock in.");
  }

  const now = Date.now();
  await insertQueueItem({
    localId: makeLocalId(),
    employeeId: employee.id,
    employeeName: employee.name,
    siteId,
    siteName,
    type: "in",
    source: "supervisorOverride",
    authorizedById: authorizedBy?.id ?? null,
    authorizedByName: authorizedBy?.name ?? null,
    createdByUid,
    subcontractorId: employee.subcontractorId ?? null,
    subcontractorName: employee.subcontractorName ?? null,
    reason: reason ?? null,
    overrideEventId: overrideEventId ?? null,
    location,
    clientTimestamp: now,
    createdAt: now,
  });
}

// Shared by OverrideEmployeeListScreen (no reason required) and
// OverrideReasonScreen (reason collected first) so the batch-loop and
// overrideEventId generation live in exactly one place. One id per batch,
// generated here, is what lets the onClockEventCreated trigger group a
// multi-employee override into a single overrideEvents doc server-side.
export async function submitOverrideBatch({
  employees,
  direction,
  createdByUid,
  authorizedBy,
  siteId,
  siteName,
  reason,
  location,
}) {
  const overrideEventId = makeLocalId();
  for (const employee of employees) {
    if (direction === "in") {
      await queueOverrideClockIn({
        employee,
        createdByUid,
        authorizedBy,
        siteId,
        siteName,
        reason,
        overrideEventId,
        location,
      });
    } else {
      await queueOverrideClockOut({
        employee,
        createdByUid,
        authorizedBy,
        siteId,
        siteName,
        reason,
        overrideEventId,
        location,
      });
    }
  }
}

export async function queueOverrideClockOut({
  employee,
  createdByUid,
  authorizedBy,
  siteId,
  siteName,
  reason,
  overrideEventId,
  location,
}) {
  const currentStatus = await getCurrentLocalStatus(employee.id);
  const now = Date.now();

  if (currentStatus === "break") {
    await insertQueueItem({
      localId: makeLocalId(),
      employeeId: employee.id,
      employeeName: employee.name,
      siteId,
      siteName,
      type: "breakEnd",
      source: "autoBreakEnd",
      createdByUid,
      subcontractorId: employee.subcontractorId ?? null,
      subcontractorName: employee.subcontractorName ?? null,
      location,
      clientTimestamp: now - 1,
      createdAt: now,
    });
  }

  await insertQueueItem({
    localId: makeLocalId(),
    employeeId: employee.id,
    employeeName: employee.name,
    siteId,
    siteName,
    type: "out",
    source: "supervisorOverride",
    authorizedById: authorizedBy?.id ?? null,
    authorizedByName: authorizedBy?.name ?? null,
    createdByUid,
    subcontractorId: employee.subcontractorId ?? null,
    subcontractorName: employee.subcontractorName ?? null,
    reason: reason ?? null,
    overrideEventId: overrideEventId ?? null,
    location,
    clientTimestamp: now,
    createdAt: now,
  });
}