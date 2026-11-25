import { z } from "zod";
import { PERMISSION_KEYS, UNASSIGNED_SITE } from "./adminAccessModel";

// Same shapes as the website's lib/validators/adminAccess.ts - keep in sync.
export const MAX_ADMIN_SITES = 500;

export const setAdminAccessSchema = z.object({
  targetUid: z.string().trim().min(1).max(128),
  level: z.enum(["full", "admin"]),
  sites: z.union([
    z.literal("all"),
    z
      .array(z.string().trim().min(1).max(200))
      .max(MAX_ADMIN_SITES)
      .refine((s) => new Set(s).size === s.length),
  ]),
  permissions: z.object(
    Object.fromEntries(PERMISSION_KEYS.map((k) => [k, z.boolean()])) as Record<(typeof PERMISSION_KEYS)[number], z.ZodBoolean>
  ),
});

export const setSiteAdminsSchema = z.object({
  siteId: z.string().trim().min(1).max(200).refine((s) => s !== UNASSIGNED_SITE),
  adminUids: z.array(z.string().trim().min(1).max(128)).max(200),
});
