import { z } from "zod";

// ---- deleteMyEmployeeAccount (Employee App Settings) ----
// The employee and company always come from the caller's claims, never
// from the client. confirm: true is required so a stray call with no body
// can never delete an account.
export const deleteMyEmployeeAccountSchema = z
  .object({
    confirm: z.literal(true),
  })
  .strict();

export type DeleteMyEmployeeAccountInput = z.infer<typeof deleteMyEmployeeAccountSchema>;

// What the app shows for each refusal (orbitworks-app/lib/employeeSettings.js
// keeps the same words for its own checks).
export const DELETE_ACCOUNT_OPEN_SHIFT_MESSAGE = "Clock out first, then delete your account.";
