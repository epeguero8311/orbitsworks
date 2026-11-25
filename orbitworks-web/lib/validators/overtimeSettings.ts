import { z } from "zod";

// Overtime settings (Task 1), Settings > Export Settings. Checked on the
// client right before the Settings save writes the company doc. The four
// new fields are also type-checked by firestore.rules (validOvertimeFields),
// so a write that skips this check is still refused.
//
// weeklyOvertimeThreshold / overtimeMultiplier are the existing top-level
// fields (no migration) - checked here too since their inputs moved into
// the same card.
export const overtimeSettingsSchema = z.object({
  overtimeEnabled: z.boolean(),
  weeklyOvertimeThreshold: z
    .number({ error: "Weekly overtime after must be a number." })
    .min(0, "Weekly overtime after can't be negative.")
    .max(168, "Weekly overtime after can't be more than 168 hours."),
  dailyOvertimeThreshold: z
    .number({ error: "Daily overtime after must be a number." })
    .min(0, "Daily overtime after can't be negative.")
    .max(24, "Daily overtime after can't be more than 24 hours."),
  overtimeWeekStartsOn: z.number().int().min(0).max(6),
  overtimeMultiplier: z
    .number({ error: "Overtime multiplier must be a number." })
    .min(1, "Overtime multiplier must be at least 1x.")
    .max(5, "Overtime multiplier can't be more than 5x."),
  overtimeRoundMinutes: z.union([z.literal(0), z.literal(5), z.literal(15), z.literal(30)]),
});

export type OvertimeSettingsInput = z.infer<typeof overtimeSettingsSchema>;
