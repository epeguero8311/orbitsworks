// Task 5 Kiosk mode (shared wall iPad, Pro) - website side.
//
// K3: NEXT_PUBLIC_KIOSK_ENABLED (apphosting*.yaml) hides every Kiosk control
// until the 1.1.6 app is in the App Store. The functions flag KIOSK_ENABLED
// is the real gate - this one only keeps the website from offering it.
export const KIOSK_ENABLED = process.env.NEXT_PUBLIC_KIOSK_ENABLED === "true";

export const KIOSK_ACCESS_LABEL = "Kiosk access";
export const KIOSK_ACCESS_HELP = "Shared iPad: employees clock in/out and take breaks with their own PIN.";
export const KIOSK_APP_NOTE = "Needs the OrbitsWorks app 1.1.6 or newer on an iPad.";

// Exit key (K16): matches functions/src/kioskTypes.ts KIOSK_EXIT_KEY_TTL_MS.
export const KIOSK_EXIT_KEY_TTL_MS = 10 * 60 * 1000;

export function isKioskRecord(employee: { kiosk?: boolean } | null | undefined): boolean {
  return employee?.kiosk === true;
}

// Why the Kiosk toggle can't be turned ON for this record (null = it can).
// The server (setEmployeeRole) checks the same and more (clocked in, flag).
export function kioskToggleBlocker(args: {
  isPro: boolean;
  appAccess: boolean | undefined;
  alreadyKiosk: boolean;
}): "core" | "employeeApp" | null {
  if (args.alreadyKiosk) return null;
  if (!args.isPro) return "core";
  if (args.appAccess === true) return "employeeApp";
  return null;
}

// mm:ss left on an exit key.
export function formatKeyCountdown(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
