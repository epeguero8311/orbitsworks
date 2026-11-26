// Task 5 Kiosk mode - constants, messages and pure rules (no Firestore), so
// test/kiosk.test.js can check them directly. kiosk.ts does the I/O.

export const KIOSK_PIN_TABLE_VERSION = 1;

// K16: the exit key.
export const KIOSK_EXIT_KEY_TTL_MS = 10 * 60 * 1000;
// pins/{pin}.employeeId while a key holds those 4 digits. Every PIN path
// (reservePinForEmployee, reserveNonJunkPin, joinCompany, backfill...)
// already treats a reservation held by anyone else as taken.
export const KIOSK_EXIT_KEY_HOLDER = "kioskExitKey";

// K14 server side: 5 wrong PINs / keys in a 60 s window per kiosk.
export const KIOSK_SERVER_MAX_WRONG = 5;
export const KIOSK_SERVER_WINDOW_MS = 60 * 1000;

export const KIOSK_MESSAGES = {
  kioskOff: "Kiosk mode isn't available yet.",
  notKiosk: "This login isn't a kiosk. Sign out and sign in again.",
  inactive: "This kiosk was turned off. Ask your admin.",
  notPro: "Kiosk needs Pro - ask your admin",
  wrongPin: "PIN not recognized",
  wrongKey: "That key didn't work. Ask your admin for a new one.",
  notAnEmployee: "This PIN can't be used to clock in here.",
} as const;

export type KioskPinTable = {
  v: typeof KIOSK_PIN_TABLE_VERSION;
  salt: string;
  isPro: boolean;
  kioskName: string;
  employees: Array<{
    id: string;
    name: string;
    hash: string;
    assignedSiteIds: string[];
    lastEventType: string | null;
    lastEventTimestamp: number | null;
    lastEventSiteId: string | null;
    lastEventSiteName: string | null;
  }>;
  unlockers: Array<{ id: string; name: string; hash: string }>;
  sites: Array<{
    id: string;
    name: string;
    active: boolean;
    requireGeofence: boolean;
    lat: number | null;
    lng: number | null;
    radiusMeters: number | null;
  }>;
  hasLocatedSites: boolean;
  serverNowMs: number;
  // Task 5 v2 (3): website Mobile App Settings -> Kiosk. Missing on older
  // servers = both off.
  createAccount?: boolean;
  requireAdminPin?: boolean;
};

function isPro(planTier: unknown): boolean {
  return typeof planTier === "string" && planTier.startsWith("pro_");
}

// K20: Pro now, or a punch made at/before the moment the plan changed (a
// punch queued on the tablet before a downgrade still goes in).
export function kioskPlanAllows(planTier: unknown, planTierChangedAtMs: number | null, punchMs: number): boolean {
  if (isPro(planTier)) return true;
  return planTierChangedAtMs !== null && punchMs <= planTierChangedAtMs;
}

type LimiterState = { count?: number; windowStartMs?: number } | undefined;

// Seconds left in a lock (0 = not locked).
export function limiterLockedFor(state: LimiterState, nowMs: number): number {
  const count = state?.count ?? 0;
  const start = state?.windowStartMs ?? 0;
  if (count < KIOSK_SERVER_MAX_WRONG) return 0;
  const end = start + KIOSK_SERVER_WINDOW_MS;
  return end > nowMs ? Math.ceil((end - nowMs) / 1000) : 0;
}

// The state after one more wrong try. A finished window starts a new one.
export function limiterAfterWrong(state: LimiterState, nowMs: number): { count: number; windowStartMs: number } {
  const start = state?.windowStartMs ?? 0;
  if (!state || nowMs - start >= KIOSK_SERVER_WINDOW_MS) return { count: 1, windowStartMs: nowMs };
  return { count: (state.count ?? 0) + 1, windowStartMs: start };
}
