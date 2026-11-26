import { z } from "zod";
import { EMPLOYEE_CLOCK_ACTIONS, punchLocationSchema } from "./employeeClockValidators";
import { appPlatformField, appVersionField } from "./appVersions";

// ---- Task 5 Kiosk mode (shared wall tablet, Pro) - callable inputs ----
//
// Same schemas as the website's lib/validators/kiosk.ts and the app's
// lib/validators/kiosk.js (no imports across packages) - keep in sync by hand.

const requestIdField = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid request id");
const pinField = z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN.");
const idField = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const photoPathField = z
  .string()
  .max(512)
  .regex(/^companies\/[A-Za-z0-9_-]{1,128}\/clockEvents\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_.-]{1,128}\.jpg$/, "Invalid photo");
// Same shape as clockEvents.ts DEVICE_ID_REGEX (the app's deviceId.js).
const deviceIdField = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

// kioskPunch: like employeeClockPunch, plus WHO is punching (the employee
// the tablet matched by PIN) and the PIN on EVERY action (K: "PIN ALWAYS
// required"). Breaks never carry a photo.
export const kioskPunchSchema = z
  .object({
    action: z.enum(EMPLOYEE_CLOCK_ACTIONS),
    requestId: requestIdField,
    employeeId: idField,
    pin: pinField,
    photoPath: photoPathField.optional(),
    deviceId: deviceIdField.optional(),
    checkPinOnly: z.literal(true).optional(),
    queuedAtMs: z.number().int().positive().optional(),
    waitMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
    expectedAtMs: z.number().int().positive().optional(),
    lastServerMs: z.number().int().positive().optional(),
    photoMissing: z.literal(true).optional(),
    location: punchLocationSchema.nullable().optional().catch(null),
    // The employee's optional comment typed on the photo screen (same as
    // the supervisor app's camera Comment button). In/out only, 1-500
    // chars - firestore.rules isValidEmployeeComment's limits.
    employeeComment: z.string().trim().min(1).max(500, "Comment must be 500 characters or fewer").optional(),
    // Task 6: the tablet's app version (Devices list). A bad value is
    // dropped, never a refused punch.
    appVersion: appVersionField.optional().catch(undefined),
    appPlatform: appPlatformField.optional().catch(undefined),
  })
  .strict()
  .refine(
    (v) => v.queuedAtMs !== undefined || (v.waitMs === undefined && v.expectedAtMs === undefined && v.lastServerMs === undefined),
    { message: "waitMs, expectedAtMs and lastServerMs only come with a queued time.", path: ["waitMs"] }
  )
  .refine((v) => v.photoMissing !== true || (v.queuedAtMs !== undefined && (v.action === "in" || v.action === "out")), {
    message: "Only a queued clock in or out can be sent without its photo.",
    path: ["photoMissing"],
  })
  .refine((v) => v.checkPinOnly !== true || v.queuedAtMs === undefined, {
    message: "A PIN check never carries a queued time.",
    path: ["queuedAtMs"],
  })
  .refine((v) => v.checkPinOnly !== true || v.action === "in" || v.action === "out", {
    message: "Only clock in and out check a PIN first.",
    path: ["checkPinOnly"],
  })
  .refine(
    (v) => ((v.action === "in" || v.action === "out") && v.checkPinOnly !== true && v.photoMissing !== true) === (v.photoPath !== undefined),
    { message: "A photo is needed to clock in or out, and never for a break or a PIN check.", path: ["photoPath"] }
  )
  .refine((v) => v.employeeComment === undefined || ((v.action === "in" || v.action === "out") && v.checkPinOnly !== true), {
    message: "A comment only goes on a clock in or out.",
    path: ["employeeComment"],
  });

export type KioskPunchInput = z.infer<typeof kioskPunchSchema>;

// getKioskPinTable: takes nothing (the kiosk comes from the login's claims).
export const getKioskPinTableSchema = z.object({}).strict();

// checkKioskUnlock: the 4-digit exit key typed on the tablet's Settings pad.
export const checkKioskUnlockSchema = z.object({ code: pinField }).strict();

// createKioskExitKey (website): which kiosk record the key is for.
export const createKioskExitKeySchema = z.object({ kioskEmployeeId: idField }).strict();

// renameKioskDevice: Kiosk Settings -> Device name. Same 1-24 chars as the
// devices/{deviceId} rules (firestore.rules) and the web's DevicesCard.
export const renameKioskDeviceSchema = z
  .object({
    deviceId: deviceIdField,
    name: z.string().trim().min(1, "Enter a device name.").max(24, "24 characters max."),
    platform: z.enum(["ios", "android", ""]),
    model: z.string().max(64).optional(),
  })
  .strict();
