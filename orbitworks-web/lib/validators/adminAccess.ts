import { z } from "zod";
import { PERMISSION_KEYS, UNASSIGNED_SITE } from "@/lib/adminAccess";

// Admin Permissions (Task 4): the Permissions modal payload, checked on the
// client before calling setAdminAccess. The function checks the same shape
// again (functions/src/adminAccessValidators.ts) - keep in sync by hand.
export const MAX_ADMIN_SITES = 500;

export const setAdminAccessSchema = z.object({
  targetUid: z.string().trim().min(1, "Pick an admin.").max(128),
  level: z.enum(["full", "admin"]),
  sites: z.union([
    z.literal("all"),
    z
      .array(z.string().trim().min(1).max(200))
      .max(MAX_ADMIN_SITES, `Pick at most ${MAX_ADMIN_SITES} job sites.`)
      .refine((s) => new Set(s).size === s.length, "Each job site can only be picked once."),
  ]),
  permissions: z.object(
    Object.fromEntries(PERMISSION_KEYS.map((k) => [k, z.boolean()])) as Record<(typeof PERMISSION_KEYS)[number], z.ZodBoolean>
  ),
});

export type SetAdminAccessInput = z.infer<typeof setAdminAccessSchema>;

// The new-job-site picker (owner / Full access only, D17): which admins get
// the new site added to their list.
export const setSiteAdminsSchema = z.object({
  siteId: z.string().trim().min(1).max(200).refine((s) => s !== UNASSIGNED_SITE, "Invalid job site."),
  adminUids: z.array(z.string().trim().min(1).max(128)).max(200),
});

export type SetSiteAdminsInput = z.infer<typeof setSiteAdminsSchema>;
