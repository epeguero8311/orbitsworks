import { z } from "zod";

export const manualTimestampSchema = z
  .object({
    employeeId: z.string().min(1, "Employee is required"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    clockInTime: z.string().regex(/^\d{2}:\d{2}$/, "Clock-in time must be HH:MM"),
    clockOutTime: z.string().regex(/^\d{2}:\d{2}$/, "Clock-out time must be HH:MM"),
    breakStartTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Break start must be HH:MM")
      .optional()
      .nullable(),
    breakEndTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Break end must be HH:MM")
      .optional()
      .nullable(),
    siteId: z.string().min(1).nullable(),
    // Optional company override. Omitted entirely = use the employee's
    // current subcontractor assignment. null = force main company.
    // string = attribute to that specific subcontractor.
    subcontractorId: z.union([z.string().min(1), z.null()]).optional(),
    reason: z.string().min(1, "Reason is required"),
  })
  .refine((data) => data.clockOutTime > data.clockInTime, {
    message: "Clock out must be after clock in",
    path: ["clockOutTime"],
  })
  .refine(
    (data) =>
      !data.breakStartTime ||
      !data.breakEndTime ||
      data.breakEndTime > data.breakStartTime,
    { message: "Break end must be after break start", path: ["breakEndTime"] }
  );

export type ManualTimestampInput = z.infer<typeof manualTimestampSchema>;

export const setApprovalStatusSchema = z.object({
  eventId: z.string().min(1, "eventId is required"),
  status: z.enum(["pending", "approved"]),
});

export type SetApprovalStatusInput = z.infer<typeof setApprovalStatusSchema>;