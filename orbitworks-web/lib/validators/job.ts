import { z } from "zod";

// Titles & Pay (add form + Edit title window). Checked on the client right
// before writing companies/{companyId}/jobs; firestore.rules also
// type-checks overtimeRate / overtimeRateHistory (validJobOvertimeFields).
export const jobSchema = z.object({
  name: z.string().trim().min(1, "Enter a title name.").max(120, "Title name is too long."),
  hourlyRate: z
    .number({ error: "Enter a valid hourly rate." })
    .min(0, "Hourly rate can't be negative.")
    .max(10000, "Hourly rate is too high."),
  // Overtime (Task 1): optional fixed OT $/hr. null = use the company
  // multiplier. Below 1.5x the hourly rate only warns, never blocks.
  overtimeRate: z
    .number({ error: "Enter a valid overtime rate, or leave it blank." })
    .min(0, "Overtime rate can't be negative.")
    .max(10000, "Overtime rate is too high.")
    .nullable(),
});

export type JobInput = z.infer<typeof jobSchema>;
