// Automatic Break: pure per-shift math, no Firebase imports, mirrored
// byte-for-byte in functions/src/autoBreak.ts (that package can't import
// across the app/web boundary, same reasoning as clockStatus.ts).
//
// Applies only to a CLOSED shift (hasClockOut) that is at least
// minimumShiftHours long - an open shift (no clock-out yet) always gets
// the real break back unchanged, regardless of settings, so a still-
// running shift never gets a break deducted before it's actually over.
// Stacks with any real tracked break; the result is capped so net worked
// time can never go below 0.
export function applyAutoBreak(
  grossMs: number,
  realBreakMs: number,
  hasClockOut: boolean,
  automaticBreakMinutes: number,
  minimumShiftHours: number
): { breakMs: number; netMs: number } {
  if (!hasClockOut || automaticBreakMinutes <= 0) {
    return { breakMs: realBreakMs, netMs: Math.max(0, grossMs - realBreakMs) };
  }
  const grossHours = grossMs / (1000 * 60 * 60);
  if (grossHours < minimumShiftHours) {
    return { breakMs: realBreakMs, netMs: Math.max(0, grossMs - realBreakMs) };
  }

  const autoBreakMs = automaticBreakMinutes * 60 * 1000;
  const breakMs = Math.min(realBreakMs + autoBreakMs, grossMs);
  return { breakMs, netMs: grossMs - breakMs };
}
