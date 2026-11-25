import { z } from "zod";

// Tips (Task 3): setShiftTip payload. Same cap and shape as the website's
// lib/validators/shiftTip.ts (setShiftTipSchema) - keep in sync by hand.
// Amount is whole cents: >= 0, <= $1,000 (decision D3).
export const MAX_TIP_CENTS = 100_000;

export const setShiftTipSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  amountCents: z.number().int().min(0).max(MAX_TIP_CENTS),
});

export type SetShiftTipInput = z.infer<typeof setShiftTipSchema>;
