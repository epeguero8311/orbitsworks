import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";
import { db } from "./shared";

// ---- Task 6 (update banner, U1-U3) ----
//
// appConfig/versions = { ios: { latest, min }, android: { latest, min } }
// is edited by hand (Firebase console) after a store build is approved.
// Signed-in users read it (firestore.rules); no client writes it.
//
// The Devices list (website) shows each shared device's app version:
//   - every supervisor-app / kiosk punch carries appVersion + appPlatform
//     (onClockEventCreated copies them onto the device doc), and
//   - reportAppVersion, called once on app open by a supervisor / admin /
//     owner / kiosk login, stamps the device doc right away.
// Employees' own phones are never in Devices: an employee login gets
// { recorded: false } and nothing is written. Only an EXISTING (named)
// device doc is updated; unnamed devices show the version of their newest
// punch instead (website useDevices).

// "1.1.6", "1.2", "10.0.3.1" - digits only, 1-4 parts.
export const APP_VERSION_REGEX = /^\d{1,4}(\.\d{1,4}){0,3}$/;
export const appVersionField = z.string().regex(APP_VERSION_REGEX, "Invalid app version");
export const appPlatformField = z.enum(["ios", "android"]);

const DEVICE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const reportAppVersionSchema = z
  .object({
    deviceId: z.string().regex(DEVICE_ID_REGEX),
    version: appVersionField,
    platform: appPlatformField,
  })
  .strict();

const SHARED_DEVICE_ROLES = new Set(["owner", "admin", "supervisor", "kiosk"]);

export const reportAppVersion = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const role = request.auth.token.role as string | undefined;
  const companyId = request.auth.token.companyId as string | undefined;
  const parsed = reportAppVersionSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", parsed.error.issues[0]?.message ?? "Invalid input.");
  // Employees' phones stay out of Devices (U3) - quietly nothing.
  if (!companyId || !role || !SHARED_DEVICE_ROLES.has(role)) return { recorded: false };

  const ref = db.collection("companies").doc(companyId).collection("devices").doc(parsed.data.deviceId);
  const recorded = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    tx.update(ref, {
      appVersion: parsed.data.version,
      appPlatform: parsed.data.platform,
      appVersionAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
  return { recorded };
});
