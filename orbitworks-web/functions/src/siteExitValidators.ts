import { z } from "zod";
import { punchLocationSchema } from "./employeeClockValidators";
import { SITE_EXIT_KINDS, SITE_EXIT_OFF_REASONS } from "./siteExitTypes";

// ---- Employee App Phase 8: leave tracking calls ----
//
// Mirrored on the phone in orbitworks-app/lib/validators/siteExit.js - keep
// both in sync by hand. The employee always comes from the login's claims,
// never from the input. A bad location becomes null (same rule as a punch);
// nothing here can ever reject or change a punch.

const uuidField = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid id");

// recordSiteExit: one start or end of one stretch, sent when the phone's
// queue syncs. exitId is made on the phone (the doc id), clockInEventId is
// the shift's clock-in (the punch's requestId = its event id). atMs is the
// phone's clock.
export const recordSiteExitSchema = z
  .object({
    exitId: uuidField,
    clockInEventId: uuidField,
    kind: z.enum(SITE_EXIT_KINDS),
    phase: z.enum(["start", "end"]),
    atMs: z.number().int().positive(),
    location: punchLocationSchema.nullable().optional().catch(null),
    offReason: z.enum(SITE_EXIT_OFF_REASONS).optional(),
  })
  .strict()
  .refine((v) => (v.kind === "trackingOff" && v.phase === "start") === (v.offReason !== undefined), {
    message: "offReason comes with the start of a trackingOff, and only then.",
    path: ["offReason"],
  });

// getShiftFence: is this shift still tracked, and with which fence.
export const getShiftFenceSchema = z.object({ clockInEventId: uuidField }).strict();

// acceptLocationConsent: the versions the employee saw on screen. The
// server refuses anything but the current ones.
const versionField = z.string().min(1).max(80);
export const acceptLocationConsentSchema = z
  .object({
    locationConsentVersion: versionField,
    privacyVersion: versionField,
  })
  .strict();

export type RecordSiteExitInput = z.infer<typeof recordSiteExitSchema>;
export type GetShiftFenceInput = z.infer<typeof getShiftFenceSchema>;
export type AcceptLocationConsentInput = z.infer<typeof acceptLocationConsentSchema>;
