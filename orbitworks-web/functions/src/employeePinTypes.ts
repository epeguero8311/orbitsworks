// ---- Employee App: "Show PIN" on the Settings tab (Phase 10 A1, D1 a) ----
//
// getMyPin hands the signed-in employee their OWN current PIN, only when
// they tap Show. The phone keeps it in memory for 30 s and never saves it.
// The phone's copy of these shapes is orbitworks-app/lib/hooks/useMyPin.js.

export type MyPinResult =
  | { status: "ok"; pin: string }
  // No usable PIN on the employee doc (admin never set one).
  | { status: "noPin" }
  | { status: "inactive" };

// Per login: this many reveals in REVEAL_WINDOW_MS, then "try again later".
export const PIN_REVEAL_MAX = 10;
export const PIN_REVEAL_WINDOW_MS = 10 * 60 * 1000;
