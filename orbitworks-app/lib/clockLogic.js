import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { deriveStatus } from "./clockStatus";
import { findEmployeeByPinLocal } from "./pinSync";
import { checkPinLockout, recordPinAttempt, resetPinLockout } from "./pinLockout";

// PIN matching now happens locally against a hashed cache synced down by
// pinSync.js - this works offline and online, and has the same trust
// boundary as the old verifyPin Cloud Function (a plaintext-equivalent
// match, no re-check at write time either before or after this change).
// Rate limiting is mirrored locally via pinLockout.js since there is no
// server round trip to rate-limit against anymore.
export async function findEmployeeByPin(companyId, pin) {
  const lockout = checkPinLockout();
  if (lockout.locked) {
    throw new Error(`Too many attempts. Please wait ${lockout.retryAfterSeconds} seconds.`);
  }

  recordPinAttempt();
  const employee = await findEmployeeByPinLocal(pin);

  if (employee) {
    resetPinLockout();
  }

  return employee;
}

export async function getLatestClockEvent(companyId, employeeId) {
  const eventsRef = collection(db, "companies", companyId, "clockEvents");
  const q = query(
    eventsRef,
    where("employeeId", "==", employeeId),
    orderBy("timestamp", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data();
}

export async function uploadClockPhoto(companyId, employeeId, photoUri) {
  const response = await fetch(photoUri);
  const blob = await response.blob();
  const filename = `${Date.now()}.jpg`;
  const photoRef = ref(
    storage,
    `companies/${companyId}/clockEvents/${employeeId}/${filename}`
  );
  await uploadBytes(photoRef, blob);
  return getDownloadURL(photoRef);
}

export async function submitClockEvent({
  companyId,
  employee,
  photoUri,
  source,
  createdByUid,
  siteId,
  siteName,
}) {
  const latest = await getLatestClockEvent(companyId, employee.id);
  const currentStatus = deriveStatus(latest?.type);
  const nextType = currentStatus === "out" ? "in" : "out";
  const photoUrl = await uploadClockPhoto(companyId, employee.id, photoUri);
  const eventsRef = collection(db, "companies", companyId, "clockEvents");

  if (currentStatus === "break" && nextType === "out") {
    await addDoc(eventsRef, {
      employeeId: employee.id,
      employeeName: employee.name,
      siteId: siteId ?? null,
      siteName: siteName ?? "Not specified",
      subcontractorId: employee.subcontractorId ?? null,
      subcontractorName: employee.subcontractorName ?? null,
      type: "breakEnd",
      source: "autoBreakEnd",
      createdByUid,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  }

  await addDoc(eventsRef, {
    employeeId: employee.id,
    employeeName: employee.name,
    siteId: siteId ?? null,
    siteName: siteName ?? "Not specified",
    subcontractorId: employee.subcontractorId ?? null,
    subcontractorName: employee.subcontractorName ?? null,
    type: nextType,
    source,
    photoUrl,
    createdByUid,
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return nextType;
}

export async function submitBreakEvent({
  companyId,
  employee,
  type,
  createdByUid,
  authorizedBy,
  siteId,
  siteName,
}) {
  const eventsRef = collection(db, "companies", companyId, "clockEvents");
  await addDoc(eventsRef, {
    employeeId: employee.id,
    employeeName: employee.name,
    siteId: siteId ?? null,
    siteName: siteName ?? "Not specified",
    subcontractorId: employee.subcontractorId ?? null,
    subcontractorName: employee.subcontractorName ?? null,
    type,
    source: "supervisorPin",
    authorizedById: authorizedBy?.id ?? null,
    authorizedByName: authorizedBy?.name ?? null,
    createdByUid,
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}

export async function submitOverrideClockIn({
  companyId,
  employee,
  createdByUid,
  authorizedBy,
  siteId,
  siteName,
}) {
  const eventsRef = collection(db, "companies", companyId, "clockEvents");
  await addDoc(eventsRef, {
    employeeId: employee.id,
    employeeName: employee.name,
    siteId: siteId ?? null,
    siteName: siteName ?? "Not specified",
    subcontractorId: employee.subcontractorId ?? null,
    subcontractorName: employee.subcontractorName ?? null,
    type: "in",
    source: "supervisorOverride",
    authorizedById: authorizedBy?.id ?? null,
    authorizedByName: authorizedBy?.name ?? null,
    createdByUid,
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}

export async function submitOverrideClockOut({
  companyId,
  employee,
  currentStatus,
  createdByUid,
  authorizedBy,
  siteId,
  siteName,
}) {
  const eventsRef = collection(db, "companies", companyId, "clockEvents");

  if (currentStatus === "break") {
    await addDoc(eventsRef, {
      employeeId: employee.id,
      employeeName: employee.name,
      siteId: siteId ?? null,
      siteName: siteName ?? "Not specified",
      subcontractorId: employee.subcontractorId ?? null,
      subcontractorName: employee.subcontractorName ?? null,
      type: "breakEnd",
      source: "autoBreakEnd",
      createdByUid,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  }

  await addDoc(eventsRef, {
    employeeId: employee.id,
    employeeName: employee.name,
    siteId: siteId ?? null,
    siteName: siteName ?? "Not specified",
    subcontractorId: employee.subcontractorId ?? null,
    subcontractorName: employee.subcontractorName ?? null,
    type: "out",
    source: "supervisorOverride",
    authorizedById: authorizedBy?.id ?? null,
    authorizedByName: authorizedBy?.name ?? null,
    createdByUid,
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}