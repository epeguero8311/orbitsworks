import type { PunchLocation } from "../employeeClockValidators";

// ---- Employee App Phase 6: is this fix from the punch? ----
//
// A fix counts when the phone got it from 5 minutes before to 1 minute
// after the punch. Both times are the phone's own clock (fixAtMs and the
// punch's queuedAtMs), so a phone with a wrong clock still compares
// fairly, and an offline punch synced hours later is judged by when it
// was made, not when it arrived. Mirrors the phone's own check in
// orbitworks-app/lib/validators/punchLocation.js - keep both in sync.
//
// Out of the window = the punch still saves, with location null.

export const FIX_MAX_BEFORE_PUNCH_MS = 5 * 60 * 1000;
export const FIX_MAX_AFTER_PUNCH_MS = 60 * 1000;

// undefined = an older app sent no location field (save nothing).
// null = no usable fix (save location: null).
export function locationForPunch(
  location: PunchLocation | null | undefined,
  punchPhoneMs: number
): PunchLocation | null | undefined {
  if (location === undefined) return undefined;
  if (location === null) return null;
  const diff = location.fixAtMs - punchPhoneMs;
  if (diff < -FIX_MAX_BEFORE_PUNCH_MS || diff > FIX_MAX_AFTER_PUNCH_MS) return null;
  return location;
}
