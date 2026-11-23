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

// ---- Website: admins see employee PINs (prod-readiness item 7) ----
//
// getEmployeePins (admin/owner only) returns PINs from the server-only
// companies/{c}/employeePins docs, keyed by employeeId. The website's copy
// of this shape is lib/hooks/useEmployeePins.ts.
export type EmployeePinsResult = { pins: Record<string, string> };
