// RC1 follow-up: an employee removed something from the Employee App's Sync
// tab that never reached the server - a Failed punch or a Not synced shift
// comment. It is lost for good, so the phone reports it (reportRemovedItem,
// employeeRemovedItems.ts) and the admin gets a punchRemoved alert. The
// phone keeps the report in its own queue until the server has it, so a
// removal made offline is still reported.
//
// Mirrors orbitworks-app/lib/removedReportLogic.js (kept in sync by hand).

export const REMOVED_ITEM_KINDS = ["punch", "comment"] as const;
export type RemovedItemKind = (typeof REMOVED_ITEM_KINDS)[number];

// The punch actions the Employee App can save (employeeClock.ts).
export const REMOVED_PUNCH_ACTIONS = ["in", "out", "breakStart", "breakEnd"] as const;
export type RemovedPunchAction = (typeof REMOVED_PUNCH_ACTIONS)[number];

export interface RemovedItemReport {
  // The removed item's own id: the punch's requestId (= the event id it
  // would have had) or the comment's requestId (= its shiftNotes id).
  // Keys the alert, so a resend never makes a second one.
  requestId: string;
  kind: RemovedItemKind;
  // Punch only.
  action?: RemovedPunchAction;
  // When the punch was made / the comment typed (phone clock).
  madeAtMs: number;
  // When the employee tapped Remove (phone clock).
  removedAtMs: number;
  // Why it couldn't be sent (the Sync tab's own words), if known.
  failMessage?: string;
  // Comment only: the shift's clock-in id and the text that was lost.
  clockEventId?: string;
  note?: string;
}

export interface ReportRemovedItemResult {
  ok: true;
  // false = nothing was lost after all (the item is on the server), or an
  // alert for it already exists.
  alerted: boolean;
}

// An employee can't flood the admin's feed: at most this many removal
// alerts per employee per day; reports past it are accepted and dropped.
export const MAX_REMOVED_ALERTS_PER_DAY = 20;
