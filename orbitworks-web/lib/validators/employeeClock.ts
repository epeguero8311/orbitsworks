import { z } from "zod";

// Input for employeeClockPunch (functions/src/employeeClock.ts) - an
// employee clocking themselves in/out or starting/ending a break from the
// Employee App. The functions package keeps its own copy of this schema
// (functions/src/employeeClockValidators.ts) - keep both in sync by hand.
//
// companyId/employeeId always come from the login's claims on the server;
// if the phone sends them they are only compared against the claims.

export const EMPLOYEE_CLOCK_ACTIONS = ["in", "out", "breakStart", "breakEnd"] as const;

// One id per tap, made on the phone (crypto.randomUUID()). Also the clock
// event's doc id, so it can never start with the reserved "auto-" prefix.
export const clockRequestIdField = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid request id");

export const clockPinField = z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN.");

// Where the phone uploaded the live clock photo. The server also checks the
// path is the caller's own folder and the file is fresh.
export const clockPhotoPathField = z
  .string()
  .max(512)
  .regex(/^companies\/[A-Za-z0-9_-]{1,128}\/clockEvents\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_.-]{1,128}\.jpg$/, "Invalid photo");

const idField = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

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
