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
