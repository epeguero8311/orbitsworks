import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "./shared";
import { requireCreatorAuth, EMPLOYEE_ID_REGEX, NAME_MAX_LENGTH } from "./createEmployee";
import { DEVICE_ID_REGEX } from "./clockEvents";
import {
  REKOGNITION_ACCESS_KEY_ID,
  REKOGNITION_SECRET_ACCESS_KEY,
  isProCompany,
  downloadImage,
  storagePathFromDownloadUrl,
  compareReferencePhotos,
} from "./rekognition";
import { createEmployeeUpdatedAlert } from "./alerts";

const UPDATED_BY_NAME_MAX_LENGTH = 100;
const RETAINED_PHOTO_MS = 30 * 24 * 60 * 60 * 1000;

type UpdateEmployeeCompany = {
  appSettings?: { allowAppEmployeeUpdate?: boolean };
  subscriptionStatus?: string;
};

type UpdateEmployeeDoc = {
  name?: string;
  photoUrl?: string;
  active?: boolean;
  lastUpdateId?: string;
  faceReference?: { status?: string; photoUrl?: string };
};

// Update Employee (mobile) - lets a supervisor/admin edit an employee's
// name and/or reference photo from the app (createEmployee.ts's sibling
// for edits instead of creation). Same requireCreatorAuth gate
// (admin/owner/supervisor), same idempotent-replay-by-client-id pattern,
// same "the client already did the Storage upload, this just links/
// validates it" shape - the only genuinely new piece is the old-vs-new
// face compare (rekognition.ts's compareReferencePhotos), used purely to
// pick the Employee Updated alert's severity.
//
// The photo is uploaded by the client to a NEW path
// (.../employees/{employeeId}/updates/{updateId}.jpg), never overwriting
// the existing reference.jpg in place - that's what lets the OLD photo
// keep existing on its own, untouched, for the 30-day retention window
// (see alerts.ts's cleanupRetainedEmployeePhotos/onEmployeeUpdateAlertDismissed),
// without a separate archive-copy step. photoUrl is just a Storage
// download URL everywhere else in this codebase (the path is extracted
// from it at read time, see rekognition.ts), so nothing else needs to know
// the path shape changed.
export const updateEmployeeProfile = onCall(
  { secrets: [REKOGNITION_ACCESS_KEY_ID, REKOGNITION_SECRET_ACCESS_KEY] },
  async (request) => {
    const { companyId, uid } = requireCreatorAuth(request);

    const data = request.data ?? {};
    const employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
    const updateId = typeof data.updateId === "string" ? data.updateId.trim() : "";
    const name = typeof data.name === "string" ? data.name.trim() : undefined;
    const photoUrl = typeof data.photoUrl === "string" ? data.photoUrl.trim() : undefined;
    const deviceId = typeof data.deviceId === "string" ? data.deviceId.trim() : null;
    const updatedByNameRaw = typeof data.updatedByName === "string" ? data.updatedByName.trim() : "";
    const updatedByName = updatedByNameRaw.slice(0, UPDATED_BY_NAME_MAX_LENGTH) || "A supervisor";

    if (!EMPLOYEE_ID_REGEX.test(employeeId)) {
      throw new HttpsError("invalid-argument", "Invalid employeeId.");
    }
    if (!EMPLOYEE_ID_REGEX.test(updateId)) {
      throw new HttpsError("invalid-argument", "Invalid updateId.");
    }
    if (name !== undefined && (!name || name.length > NAME_MAX_LENGTH)) {
      throw new HttpsError("invalid-argument", "A valid name is required.");
    }
    if (deviceId !== null && !DEVICE_ID_REGEX.test(deviceId)) {
      throw new HttpsError("invalid-argument", "Invalid deviceId.");
    }
    if (photoUrl !== undefined) {
      const expectedPathFragment = encodeURIComponent(
        `companies/${companyId}/employees/${employeeId}/updates/${updateId}.jpg`
      );
      if (!photoUrl || !photoUrl.includes(expectedPathFragment)) {
        throw new HttpsError("invalid-argument", "photoUrl does not match the expected path.");
      }
    }
    if (name === undefined && photoUrl === undefined) {
      throw new HttpsError("invalid-argument", "Nothing to update.");
    }

    const employeeRef = db.collection("companies").doc(companyId).collection("employees").doc(employeeId);
    const employeeSnap = await employeeRef.get();
    if (!employeeSnap.exists) {
      throw new HttpsError("not-found", "Employee not found.");
    }
    const employee = employeeSnap.data() as UpdateEmployeeDoc;
    if (employee.active !== true) {
      throw new HttpsError("failed-precondition", "This employee is not active.");
    }

    // Idempotent replay: the same caller retrying after an earlier attempt's
    // response never reached the device - same reasoning as createEmployee.ts's
    // matching-field replay check, just keyed on the client-generated
    // updateId instead (every field of a genuine edit could legitimately
    // repeat a prior value, so updateId is the only safe replay key here).
    if (employee.lastUpdateId === updateId) {
      return { employeeId, updated: true };
    }

    const companySnap = await db.collection("companies").doc(companyId).get();
    const company = companySnap.data() as UpdateEmployeeCompany | undefined;
    if (company?.appSettings?.allowAppEmployeeUpdate === false) {
      throw new HttpsError("failed-precondition", "Updating employees from the app is turned off.");
    }
    if (company?.subscriptionStatus === "past_due") {
      throw new HttpsError("failed-precondition", "Subscription is past due.");
    }

    const nameChanged = name !== undefined && name !== employee.name;
    const photoChanged = photoUrl !== undefined && photoUrl !== employee.photoUrl;
    const changedFields: ("name" | "photo")[] = [
      ...(nameChanged ? (["name"] as const) : []),
      ...(photoChanged ? (["photo"] as const) : []),
    ];
    if (changedFields.length === 0) {
      return { employeeId, updated: true };
    }

    const oldPhotoUrl = photoChanged ? employee.photoUrl ?? null : null;
    const oldPhotoPath = oldPhotoUrl ? storagePathFromDownloadUrl(oldPhotoUrl) : null;

    let severity: "warning" | "urgent" = "warning";
    let photoCompareRan = false;
    let photoCompareSimilarity: number | null = null;

    if (photoChanged && oldPhotoPath) {
      const oldWasUsable =
        !(employee.faceReference?.status === "bad" && employee.faceReference.photoUrl === oldPhotoUrl) &&
        (await isProCompany(companyId));
      if (oldWasUsable) {
        const newPath = storagePathFromDownloadUrl(photoUrl as string);
        if (newPath) {
          const [oldBytes, newBytes] = await Promise.all([
            downloadImage(oldPhotoPath, { companyId, employeeId, updateId }),
            downloadImage(newPath, { companyId, employeeId, updateId }),
          ]);
          if (oldBytes && newBytes) {
            photoCompareRan = true;
            const result = await compareReferencePhotos(oldBytes, newBytes);
            if (result) {
              photoCompareSimilarity = result.similarity;
              severity = result.samePerson ? "warning" : "urgent";
            }
          }
        }
      }
    }

    let updatedByDeviceName: string | null = null;
    if (deviceId) {
      const deviceSnap = await db.collection("companies").doc(companyId).collection("devices").doc(deviceId).get();
      updatedByDeviceName = (deviceSnap.data() as { name?: string } | undefined)?.name ?? null;
    }

    const now = admin.firestore.Timestamp.now();
    const employeeName = name ?? employee.name ?? "An employee";

    const batch = db.batch();
    batch.update(employeeRef, {
      ...(nameChanged ? { name } : {}),
      ...(photoChanged ? { photoUrl } : {}),
      updatedByUid: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByDeviceId: deviceId,
      lastUpdateId: updateId,
    });
    batch.set(db.collection("companies").doc(companyId).collection("employeeUpdates").doc(updateId), {
      employeeId,
      employeeName,
      changedFields,
      oldName: nameChanged ? employee.name ?? null : null,
      newName: nameChanged ? name : null,
      oldPhotoUrl: photoChanged ? oldPhotoUrl : null,
      newPhotoUrl: photoChanged ? photoUrl : null,
      oldPhotoPath: photoChanged ? oldPhotoPath : null,
      severity,
      photoCompareRan,
      photoCompareSimilarity,
      updatedByUid: uid,
      updatedByName,
      updatedByDeviceId: deviceId,
      updatedByDeviceName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      retainedPhotoExpiresAt:
        photoChanged && oldPhotoPath ? admin.firestore.Timestamp.fromMillis(Date.now() + RETAINED_PHOTO_MS) : null,
      retainedPhotoDeletedAt: null,
    });
    await batch.commit();

    await createEmployeeUpdatedAlert(companyId, employeeId, employeeName, updateId, changedFields, severity, now);

    return { employeeId, updated: true };
  }
);
