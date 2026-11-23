import { z } from "zod";

// ---- Phase 9 (H4 a): dismiss a possible-duplicate flag ----
//
// The admin/owner says the flagged employee is not a duplicate. Only the
// employee id comes from the client; the company always comes from the
// caller's claims.
export const dismissDuplicateFlagSchema = z
  .object({
    employeeId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Invalid employee"),
  })
  .strict();

export type DismissDuplicateFlagInput = z.infer<typeof dismissDuplicateFlagSchema>;
