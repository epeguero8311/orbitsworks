import { z } from "zod";

// ---- getEmployeePins (website, admin/owner) - prod-readiness item 7 ----
// No employeeId = every employee of the caller's company (Employees table);
// an employeeId = just that one (Edit Employee modal).
export const getEmployeePinsSchema = z
  .object({
    employeeId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
