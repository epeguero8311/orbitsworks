import { z } from "zod";

// Inputs for the Pro company join code (the QR employees scan to sign up
// for the employee app). The server (lib/joinCodes/server.ts) generates the
// token and fills codeId/companyId/createdByUid/joinedCount/status itself -
// none of those are client input. companyId always comes from the caller's
// claims, never the body.

// 24 random bytes as base64url = 32 chars. Accept a little range so a
// future longer token still validates.
export const joinCodeTokenField = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "Invalid code");

const joinCodeFields = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  siteId: z.string().trim().min(1, "Pick a job site"),
  // [] = in-house only; [ids] = in-house or one of these subcontractors.
  subcontractorIds: z.array(z.string().trim().min(1)).max(200),
  locationRequired: z.boolean(),
  // null = no code limit (joins are still capped by the plan's seats).
  userLimit: z.number().int().min(1, "User limit must be at least 1").max(10000).nullable(),
  // ISO date-time with offset, or null = never expires.
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});

// Create: expiry must be in the future (an already-dead code is pointless).
export const joinCodeCreateSchema = joinCodeFields.refine(
  (v) => v.expiresAt === null || new Date(v.expiresAt).getTime() > Date.now(),
  { message: "Expiry must be in the future", path: ["expiresAt"] }
);

// Edit: a past expiry is allowed - that's how an admin ends a code now.
export const joinCodeUpdateSchema = joinCodeFields.extend({ token: joinCodeTokenField });

// Regenerate / revoke.
export const joinCodeTokenSchema = z.object({ token: joinCodeTokenField });

export type JoinCodeCreateInput = z.infer<typeof joinCodeCreateSchema>;
export type JoinCodeUpdateInput = z.infer<typeof joinCodeUpdateSchema>;

// User limit can't exceed the plan's active employee cap. activeCap null =
// no cap (custom plan). Used by the modal (cap from GET /api/join-codes) and
// by the server (cap from the company doc).
export function withActiveCap<T extends z.ZodType<{ userLimit: number | null }>>(schema: T, activeCap: number | null) {
  return schema.refine(
    (v) => activeCap === null || v.userLimit === null || v.userLimit <= activeCap,
    { message: `User limit can't be more than your plan's ${activeCap} active employees`, path: ["userLimit"] }
  );
}
