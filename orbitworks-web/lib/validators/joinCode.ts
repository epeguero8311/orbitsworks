import { z } from "zod";

// Input for creating a company join code (the QR employees scan to sign up
// for the employee app). The server (Cloud Function) generates the random
// token and fills companyId/siteName/createdBy/joinedCount/status itself -
// none of those are client input.
export const joinCodeCreateSchema = z.object({
  siteId: z.string().trim().min(1, "Pick a job site"),
  // null = any active subcontractor allowed, [] = in-house only.
  allowedSubcontractorIds: z.array(z.string().trim().min(1)).max(200).nullable(),
  locationRequirement: z.enum(["required", "optional"]),
  // null = unlimited.
  userLimit: z.number().int().min(1).max(10000).nullable(),
  // ISO date-time string, or null = never expires.
  expiresAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .refine((v) => v === null || new Date(v).getTime() > Date.now(), {
      message: "Expiry must be in the future",
    }),
});

export type JoinCodeCreateInput = z.infer<typeof joinCodeCreateSchema>;
