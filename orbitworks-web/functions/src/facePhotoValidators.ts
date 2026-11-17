import { z } from "zod";

// ---- removeEmployeePhoto (website, admin/owner) - biometric audit c ----
// Just the employee. The company always comes from the caller's claims,
// never from the client.
export const removeEmployeePhotoSchema = z
  .object({
    employeeId: z.string().trim().min(1).max(200),
  })
  .strict();

export type RemoveEmployeePhotoInput = z.infer<typeof removeEmployeePhotoSchema>;
