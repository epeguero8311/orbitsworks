import { z } from "zod";

// Shared with the mobile app's client-side check before it queues an
// override write (functions/src/index.ts's trigger only reads
// already-written data, so this schema's real enforcement point is
// there, in OverrideReasonScreen.js).
export const overrideReasonSchema = z.string().trim().min(10).max(500);
