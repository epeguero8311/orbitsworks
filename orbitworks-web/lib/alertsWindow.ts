// Phase 10 fix round 1 (W8 a, W7 item 1) - the Overview alerts listener
// used to read every alert the company ever had. It now reads only alerts
// that happened in the last ALERTS_WINDOW_DAYS, newest first, at most
// ALERTS_MAX of them.
//
// 30 days = ALERT_ACTION_LOOKBACK_DAYS (dashboardOverviewUtils.ts): an
// Ignore / resolve is only remembered that long, so an older alert would
// have come back as "new" anyway. Dismissals live in alertActions, not on
// the alert doc, so "undismissed" can't be queried - the window is the cut.
// No imports, so test/phase10Lib.test.mjs runs it under plain Node.

export const ALERTS_WINDOW_DAYS = 30;
export const ALERTS_MAX = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

// The oldest occurredAt the Overview reads.
export function alertsSince(nowMs: number): Date {
  return new Date(nowMs - ALERTS_WINDOW_DAYS * DAY_MS);
}

// Shown under the list when the cap was hit (more than ALERTS_MAX alerts in
// the window). null = everything in the window is shown.
export function alertsCapNote(count: number): string | null {
  return count >= ALERTS_MAX ? `Showing the newest ${ALERTS_MAX} alerts from the last ${ALERTS_WINDOW_DAYS} days.` : null;
}
