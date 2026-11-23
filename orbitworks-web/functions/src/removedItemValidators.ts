import { z } from "zod";
import { REMOVED_ITEM_KINDS, REMOVED_PUNCH_ACTIONS } from "./removedItemTypes";

// ---- RC1 follow-up: reportRemovedItem input ----
//
// Mirrored on the phone in orbitworks-app/lib/removedReportLogic.js
// (buildRemovedReport) - keep both in sync by hand. The employee always
// comes from the login's claims, never from the input.

const uuidField = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid id");

// Phone clock times: a whole ms number after 2020 and not absurdly far out.
const phoneMs = z.number().int().min(Date.UTC(2020, 0, 1)).max(Date.UTC(2100, 0, 1));

export const reportRemovedItemSchema = z
  .object({
    requestId: uuidField,
    kind: z.enum(REMOVED_ITEM_KINDS),
    action: z.enum(REMOVED_PUNCH_ACTIONS).optional(),
    madeAtMs: phoneMs,
    removedAtMs: phoneMs,
    // The Sync tab's words - shown to the admin, never trusted for anything.
    failMessage: z.string().max(300).optional(),
    clockEventId: uuidField.optional(),
    note: z.string().min(1).max(1000).optional(),
  })
  .strict()
  .refine((v) => (v.kind === "punch") === (v.action !== undefined), {
    message: "action comes with a punch, and only then.",
    path: ["action"],
  })
  .refine((v) => v.kind === "comment" || (v.clockEventId === undefined && v.note === undefined), {
    message: "clockEventId / note come with a comment only.",
    path: ["kind"],
  })
  .refine((v) => v.kind === "punch" || v.clockEventId !== undefined, {
    message: "A comment names its shift.",
    path: ["clockEventId"],
  });

export type ReportRemovedItemInput = z.infer<typeof reportRemovedItemSchema>;
