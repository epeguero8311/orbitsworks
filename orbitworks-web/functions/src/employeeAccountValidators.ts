import { z } from "zod";

// ---- deleteMyEmployeeAccount (website /delete-account) ----
// The employee and company always come from the caller's claims, never
// from the client. confirm: true is required so a stray call with no body
// can never delete an account.
export const deleteMyEmployeeAccountSchema = z
  .object({
    confirm: z.literal(true),
  })
  .strict();

export type DeleteMyEmployeeAccountInput = z.infer<typeof deleteMyEmployeeAccountSchema>;

// The refusal text (the website maps the code to its own words,
// lib/deleteAccount.ts).
export const DELETE_ACCOUNT_OPEN_SHIFT_MESSAGE = "Clock out first, then delete your account.";
