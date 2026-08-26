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
import { httpsCallable } from "firebase/functions";
import { db, storage, functions } from "./firebase";
import { deriveStatus } from "./clockStatus";

// PIN matching now happens server-side via the verifyPin Cloud Function -
// rate-limited and scoped to the caller's own companyId claim, instead of
// an unthrottled client-side Firestore query against the full PIN space.
export async function findEmployeeByPin(companyId, pin) {
  const verifyPin = httpsCallable(functions, "verifyPin");
  try {
    const result = await verifyPin({ pin });
    const data = result.data;
    if (!data.matched) return null;
    return { id: data.employee.id, ...data.employee };
  } catch (err) {
    if (err.code === "functions/resource-exhausted") {
      throw new Error(err.message || "Too many attempts. Please wait and try again.");
    }
    throw err;
  }
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

  // If they were on break when clocked out, close the break first so the
  // break duration is accurate and they do not get stuck showing "on break"
  // after their shift has already ended.
  if (currentStatus === "break" && nextType === "out") {
    await addDoc(eventsRef, {
      employeeId: employee.id,
      employeeName: employee.name,
      siteId: siteId ?? null,
      siteName: siteName ?? "Not specified",
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
    type: nextType,
    source,
    photoUrl,
    createdByUid,
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return nextType;
}

// Breaks are unpaid and tracked only - no photo capture, unlike clock in/out.
// type must be "breakStart" or "breakEnd", decided by the caller based on
// each target employee's current status so this function never has to guess.
// authorizedBy is the employee record matched by PIN on the Breaks screen -
// this is who is responsible for putting the person on/off break, separate
// from createdByUid which is just the logged-in session account.
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
    type,
    source: "supervisorPin",
    authorizedById: authorizedBy?.id ?? null,
    authorizedByName: authorizedBy?.name ?? null,
    createdByUid,
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}