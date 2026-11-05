import { z } from "zod";

// ---- Temp clock-in links: list call inputs (Phase 10 W1) ----
//
// A link token is randomBytes(24) as base64url = 32 characters
// (tempClockLinks.ts). The company always comes from the caller's claims.

export const tempLinkTokenField = z.string().regex(/^[A-Za-z0-9_-]{32}$/, "Invalid link");

// listTempClockLinkHistory: no input = the newest 10. afterToken = the
// last link of the page already shown; the next 10 start after it.
export const listTempClockLinkHistorySchema = z
  .object({
    afterToken: tempLinkTokenField.optional(),
  })
  .strict();

// listActiveTempClockLinks takes nothing.
export const listActiveTempClockLinksSchema = z.object({}).strict();
