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
  })
  .refine((v) => (v.action === "in" || v.action === "out") === (v.pin !== undefined), {
    message: "A PIN is needed to clock in or out, and never for a break.",
    path: ["pin"],
  })
  .refine((v) => (v.action === "in" || v.action === "out") === (v.photoPath !== undefined), {
    message: "A photo is needed to clock in or out, and never for a break.",
    path: ["photoPath"],
  });

export type EmployeeClockPunchInput = z.infer<typeof employeeClockPunchSchema>;
