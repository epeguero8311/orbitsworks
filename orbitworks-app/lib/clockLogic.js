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

export async function findEmployeeByPin(companyId, pin) {
  const employeesRef = collection(db, "companies", companyId, "employees");
  const q = query(
    employeesRef,
    where("pin", "==", pin),
    where("active", "==", true)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
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
  const nextType = latest?.type === "in" ? "out" : "in";

  const photoUrl = await uploadClockPhoto(companyId, employee.id, photoUri);

  const eventsRef = collection(db, "companies", companyId, "clockEvents");
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
