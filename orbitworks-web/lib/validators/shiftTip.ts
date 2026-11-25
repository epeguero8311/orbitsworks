import { z } from "zod";

// Tips (Task 3): the dollar amount an admin types into the Tips field of the
// Approve Hours shift modal. Checked on the client before calling setShiftTip;
// the function checks the cents value again (functions/src/shiftTipValidators.ts,
// same cap) - keep the two in sync by hand.
// Rules (decision D3): >= 0, at most 2 decimals, at most $1,000, stored in
// whole cents. Blank = $0.00 (clears the tip).
export const MAX_TIP_CENTS = 100_000; // $1,000.00

export const TIP_ERRORS = {
  notANumber: "Enter a dollar amount, like 45 or 45.50.",
  tooManyDecimals: "Tips can have at most 2 decimals.",
  tooBig: "Tips can't be more than $1,000.",
} as const;

// Accepts "45", "45.5", "45.50", "$45.00", "1,000", " 12 " -> whole cents.
// Parsed digit by digit (no float math), so "0.29" is exactly 29 cents.
export const tipAmountSchema = z
  .string()
  .transform((raw) => raw.trim().replace(/^\$/, "").replace(/,/g, "").trim())
  .pipe(
    z
      .string()
      .refine((v) => v === "" || (/^\d*(\.\d*)?$/.test(v) && v !== "."), TIP_ERRORS.notANumber)
      .refine((v) => !/\.\d{3,}$/.test(v), TIP_ERRORS.tooManyDecimals)
      .transform((v) => {
        if (v === "") return 0;
        const [whole, frac = ""] = v.split(".");
        return Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
      })
      .pipe(z.number().int().min(0).max(MAX_TIP_CENTS, TIP_ERRORS.tooBig))
  );

// The setShiftTip call payload (website side).
export const setShiftTipSchema = z.object({
  eventId: z.string().trim().min(1, "Shift is required."),
  amountCents: z.number().int().min(0).max(MAX_TIP_CENTS, TIP_ERRORS.tooBig),
});

export type SetShiftTipInput = z.infer<typeof setShiftTipSchema>;

// The Export Settings "Tips" toggle (top-level company field tipsEnabled,
// default OFF). firestore.rules type-checks it too (validCompanyTipsFields).
export const tipsEnabledSchema = z.boolean();

export function formatTipCents(cents: number | null | undefined): string {
  const c = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return `$${(c / 100).toFixed(2)}`;
}
