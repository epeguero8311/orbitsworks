import { z } from "zod";

// ---- employeeClockPunch input (Employee App clock in/out/breaks) ----
//
// Same schema as the website's lib/validators/employeeClock.ts (this
// package can't import across the web boundary) - keep both in sync by hand.

export const EMPLOYEE_CLOCK_ACTIONS = ["in", "out", "breakStart", "breakEnd"] as const;
export type EmployeeClockAction = (typeof EMPLOYEE_CLOCK_ACTIONS)[number];

const clockRequestIdField = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid request id");

const clockPinField = z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN.");

const clockPhotoPathField = z
  .string()
  .max(512)
  .regex(/^companies\/[A-Za-z0-9_-]{1,128}\/clockEvents\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_.-]{1,128}\.jpg$/, "Invalid photo");

const idField = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

// ---- Phase 6: where the punch happened ----
//
// The phone's fix for this punch: lat/lng, accuracy (meters, may be null
// on some phones) and fixAtMs (when the phone got the fix, phone clock).
// Accuracy above LOCATION_ACCURACY_MAX_M is not a real fix. Only used for
// display and Pro site detection, never to decide whether a punch counts.
export const LOCATION_ACCURACY_MAX_M = 100000;

export const punchLocationSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    accuracyM: z.number().finite().min(0).max(LOCATION_ACCURACY_MAX_M).nullable(),
    fixAtMs: z.number().int().positive(),
  })
  .strict();

export type PunchLocation = z.infer<typeof punchLocationSchema>;

export const employeeClockPunchSchema = z
  .object({
    action: z.enum(EMPLOYEE_CLOCK_ACTIONS),
    requestId: clockRequestIdField,
    pin: clockPinField.optional(),
    photoPath: clockPhotoPathField.optional(),
    companyId: idField.optional(),
    employeeId: idField.optional(),
    // true = only check the PIN (before the camera opens); nothing is
    // written. The real punch still checks the PIN itself.
    checkPinOnly: z.literal(true).optional(),
    // Phase 4 offline punches: when the employee made this punch on the
    // phone (ms since epoch). Present only for a punch that was queued on
    // the phone and is being sent later; the server then uses this time
    // (within limits) instead of its own and tags the event "synced late".
    queuedAtMs: z.number().int().positive().optional(),
    // Fast sync (see employeeClockQueued.ts): how long the queued punch
    // waited on the phone, by its uptime clock in the same app run.
    waitMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
    // When the phone expected the punch to be: last server time it saw +
    // uptime since. Only used to set phoneClockOff.
    expectedAtMs: z.number().int().positive().optional(),
    // Phase 6. Missing = an older app (no location step). null = the phone
    // tried and had no fix. A bad value also becomes null - a location
    // problem never rejects a punch.
    location: punchLocationSchema.nullable().optional().catch(null),
  })
  .refine((v) => v.queuedAtMs !== undefined || (v.waitMs === undefined && v.expectedAtMs === undefined), {
    message: "waitMs and expectedAtMs only come with a queued time.",
    path: ["waitMs"],
  })
  .refine((v) => (v.action === "in" || v.action === "out") === (v.pin !== undefined), {
    message: "A PIN is needed to clock in or out, and never for a break.",
    path: ["pin"],
  })
  .refine((v) => v.checkPinOnly !== true || v.queuedAtMs === undefined, {
    message: "A PIN check never carries a queued time.",
    path: ["queuedAtMs"],
  })
  .refine((v) => v.checkPinOnly !== true || v.action === "in" || v.action === "out", {
    message: "Only clock in and out check a PIN.",
    path: ["checkPinOnly"],
  })
  .refine((v) => ((v.action === "in" || v.action === "out") && v.checkPinOnly !== true) === (v.photoPath !== undefined), {
    message: "A photo is needed to clock in or out, and never for a break or a PIN check.",
    path: ["photoPath"],
  });

export type EmployeeClockPunchInput = z.infer<typeof employeeClockPunchSchema>;

// ---- getMyPinVerifier input (Employee App PIN check on the phone) ----
// Takes nothing: who it is comes from the login's claims only.
export const getMyPinVerifierSchema = z.object({}).strict();
