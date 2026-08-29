import * as FileSystem from "expo-file-system/legacy";
import { getDb } from "./db";
import { getCurrentLocalStatus } from "./clockStatusLocal";
import { notifyQueueChange } from "./queueEvents";

function makeLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function insertQueueItem(item) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO event_queue
      (localId, employeeId, employeeName, siteId, siteName, type, photoLocalUri, note, source, authorizedById, authorizedByName, createdByUid, clientTimestamp, syncStatus, attempts, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
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

export async function queueClockEvent({ employee, photoUri, source, createdByUid, siteId, siteName }) {
  const currentStatus = await getCurrentLocalStatus(employee.id);
  const nextType = currentStatus === "out" ? "in" : "out";
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
    clientTimestamp: now,
    createdAt: now,
  });

  return nextType;
}

export async function queueBreakEvent({ employee, type, createdByUid, authorizedBy, siteId, siteName }) {
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
    clientTimestamp: now,
    createdAt: now,
  });
}

export async function queueOverrideClockIn({ employee, createdByUid, authorizedBy, siteId, siteName }) {
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
    clientTimestamp: now,
    createdAt: now,
  });
}

export async function queueOverrideClockOut({ employee, createdByUid, authorizedBy, siteId, siteName }) {
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
    clientTimestamp: now,
    createdAt: now,
  });
}