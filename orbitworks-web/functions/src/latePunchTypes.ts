// ---- B (2026-11-21): late queued punches are never refused ----
//
// An Employee App punch saved offline is recorded whenever it reaches the
// server, at its own time, and flagged for the admin instead of refused:
//   - "Synced late, X h" tag on any queued punch 5+ min late (unchanged)
//   - punchSyncedLate alert (web only) when it is more than 24 h late
//   - punchSyncedVeryLate alert (urgent, pushed) when more than 30 days
//   - punchFlagged alert (web only) for a phone clock set back, a missing
//     photo (face not checked), time not proven, or an event it replaced /
//     conflicts with
// A real queued punch wins over auto clock-out and hand-entered (admin)
// events of the same shift: those are removed with a copy kept on the
// punch (replacedEvents). Two real punches that don't fit together are
// both kept and flagged (punchConflict). See latePunchPlacement.ts.
// Still refused (security): wrong PIN, the 5-wrong-PIN block, an inactive
// or unlinked login.

export const LATE_ALERT_AFTER_MS = 24 * 60 * 60 * 1000;
export const VERY_LATE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
// A punch made more than this long after the phone's last server contact
// can't have its time proven (the phone was offline the whole time).
export const TIME_NOT_PROVEN_AFTER_MS = 60 * 60 * 1000;
// A hand-entered event is the "same" as a real punch (and replaced by it)
// when it is the same type within this long.
export const SAME_PUNCH_WINDOW_MS = 12 * 60 * 60 * 1000;

// A copy of an event a real queued punch removed.
export type ReplacedEvent = {
  id: string;
  type: string;
  source: string;
  timestampMs: number;
};

// Server-only fields employeeClockPunch adds to a queued punch.
export type LatePunchFields = {
  // The phone's last server contact before the punch (survives restarts).
  offlineSinceMs?: number;
  // Made more than TIME_NOT_PROVEN_AFTER_MS after that contact, or the
  // phone had no contact time at all.
  timeNotProven?: true;
  // The phone lost the face photo: recorded anyway, face not checked.
  photoMissing?: true;
  // Doesn't fit the real punches around it (e.g. a second clock-in).
  punchConflict?: true;
  // Auto clock-out / hand-entered events this punch replaced.
  replacedEvents?: ReplacedEvent[];
};
