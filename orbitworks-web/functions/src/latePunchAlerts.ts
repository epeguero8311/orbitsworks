import * as admin from "firebase-admin";
import { COMPANY_TIMEZONE, localDateKey } from "./shared";
import { createAlertIfNew } from "./alerts";
import { sendPushForAlert } from "./pushSend";
import { LATE_ALERT_AFTER_MS, VERY_LATE_AFTER_MS, type ReplacedEvent } from "./latePunchTypes";

// ---- B (2026-11-21): the admin's alerts for a late / flagged queued punch ----
//
// After employeeClockPunch records a queued punch (latePunchTypes.ts):
//   - more than 30 days late -> punchSyncedVeryLate (urgent, pushed)
//   - more than 24 h late    -> punchSyncedLate (web only)
//   - phone clock set back, photo missing, a conflict, or events it
//     replaced -> punchFlagged (web only), listing each, with the replaced
//     events' own times next to the real punch's time
// One of each per punch (keyed by the event id). Never throws - an alert
// problem must never undo a recorded punch.

const ACTION_TEXT: Record<string, string> = {
  in: "clock-in",
  out: "clock-out",
  breakStart: "break start",
  breakEnd: "break end",
};

const SOURCE_TEXT: Record<string, string> = {
  autoClockOut: "auto",
  adminManual: "hand-entered",
};

export function whenText(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

// "49 h", "3 days".
export function lateText(lateMs: number): string {
  const hours = Math.floor(lateMs / (60 * 60 * 1000));
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}

export type LatePunchFacts = {
  name: string;
  action: string;
  eventMs: number;
  nowMs: number;
  offlineSinceMs?: number;
  phoneClockOff?: boolean;
  photoMissing?: boolean;
  punchConflict?: boolean;
  replaced?: ReplacedEvent[];
};

// Which late alert, if any.
export function lateAlertType(lateMs: number): "punchSyncedVeryLate" | "punchSyncedLate" | null {
  if (lateMs > VERY_LATE_AFTER_MS) return "punchSyncedVeryLate";
  if (lateMs > LATE_ALERT_AFTER_MS) return "punchSyncedLate";
  return null;
}

export function lateMessage(f: LatePunchFacts): string {
  const lateMs = f.nowMs - f.eventMs;
  const what = ACTION_TEXT[f.action] ?? "punch";
  const offline = f.offlineSinceMs ? ` (phone offline since ${whenText(f.offlineSinceMs)})` : "";
  const pay = lateMs > VERY_LATE_AFTER_MS ? " Pay for that period may already be done." : "";
  return `${f.name}'s ${what} from ${whenText(f.eventMs)} reached the server ${lateText(lateMs)} late${offline}. Its time can't be proven - check it in Approve Hours.${pay}`;
}

// The "needs a look" list, or null when there's nothing to flag.
export function flaggedMessage(f: LatePunchFacts): string | null {
  const items: string[] = [];
  for (const e of f.replaced ?? []) {
    const kind = SOURCE_TEXT[e.source] ?? "earlier";
    items.push(`replaced the ${kind} ${ACTION_TEXT[e.type] ?? "punch"} at ${whenText(e.timestampMs)}`);
  }
  if (f.punchConflict) items.push("doesn't fit their other punches - check Time Tracking");
  if (f.phoneClockOff) items.push("the phone's clock was set back");
  if (f.photoMissing) items.push("photo missing, face not checked");
  if (items.length === 0) return null;
  const what = ACTION_TEXT[f.action] ?? "punch";
  return `${f.name}'s real ${what} at ${whenText(f.eventMs)} needs a look: ${items.join("; ")}.`;
}

export async function createLatePunchAlerts(
  input: LatePunchFacts & { companyId: string; employeeId: string; eventId: string; siteId: string | null; siteName: string | null }
): Promise<void> {
  const base = {
    companyId: input.companyId,
    employeeId: input.employeeId,
    employeeName: input.name,
    siteId: input.siteId,
    siteName: input.siteName,
    eventId: input.eventId,
    employeeUpdateId: null,
    dateKey: localDateKey(new Date(input.eventMs)),
  };
  const occurredAt = admin.firestore.Timestamp.fromMillis(input.nowMs);
  try {
    const type = lateAlertType(input.nowMs - input.eventMs);
    if (type) {
      const alert = await createAlertIfNew({ ...base, alertType: type, message: lateMessage(input) }, occurredAt);
      if (alert && type === "punchSyncedVeryLate") await sendPushForAlert(alert);
    }
    const flagged = flaggedMessage(input);
    if (flagged) await createAlertIfNew({ ...base, alertType: "punchFlagged", message: flagged }, occurredAt);
  } catch (err) {
    console.warn("Late punch alert failed", { companyId: input.companyId, eventId: input.eventId, error: String(err) });
  }
}
