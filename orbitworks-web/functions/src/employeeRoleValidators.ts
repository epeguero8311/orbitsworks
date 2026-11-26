import { z } from "zod";

// Task 5 v2 (A): Team -> Edit employee -> account type. appType is the
// radio (one app at most), isAdmin the separate website toggle. Old
// website builds still send { isSupervisor, isAdmin, isKiosk } with no
// appType - setEmployeeRole maps those the old way.
export const setEmployeeRoleSchema = z
  .object({
    employeeId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/, "Invalid employee"),
    appType: z.enum(["employee", "supervisor", "kiosk", "none"]).optional(),
    isAdmin: z.boolean().optional(),
    isSupervisor: z.boolean().optional(),
    isKiosk: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.appType === "kiosk" && v.isAdmin) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Kiosk can't be combined with Admin access." });
    }
    if (v.appType === "none" && !v.isAdmin) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick an app type or turn on Admin access. To remove someone, deactivate them." });
    }
  });

export type SetEmployeeRoleInput = z.infer<typeof setEmployeeRoleSchema>;
