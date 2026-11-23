import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, COMPANY_TIMEZONE, localDateKey } from "./shared";
import { createAlertIfNew } from "./alerts";
import { ownQueueCaller } from "./promotedCaller";
import { reportRemovedItemSchema, type ReportRemovedItemInput } from "./removedItemValidators";
import { MAX_REMOVED_ALERTS_PER_DAY, type ReportRemovedItemResult } from "./removedItemTypes";

// ---- RC1 follow-up: an unsent punch / comment was removed on the phone ----
//
// The Employee App's Sync tab lets an employee Remove a Failed punch or a
// Not synced shift comment - it never reached the server and is now lost
// for good. The phone queues a report at the moment of Remove and sends it
// here (offline -> sent later, same queue run as the punches). This writes
// one punchRemoved alert for the admin (web Overview, never pushed).
//
// Safe to resend: the alert id is keyed by the item's requestId.
// Nothing lost after all (the event / comment is on the server): no alert.
// The employee comes from the login's claims, never from the input. A
// promoted login (made supervisor/admin since) can still send its own
// reports (ownQueueCaller).

const ACTION_TEXT: Record<string, string> = {
  in: "clock-in",
  out: "clock-out",
  breakStart: "break start",
  breakEnd: "break end",
};

function whenText(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function removedItemMessage(name: string, input: ReportRemovedItemInput): string {
  const why = input.failMessage ? ` It couldn't be sent: ${clip(input.failMessage, 160)}` : "";
  if (input.kind === "punch") {
    const what = ACTION_TEXT[input.action ?? ""] ?? "punch";
    return `${name} removed an unsent ${what} from ${whenText(input.madeAtMs)} on their phone. It was never recorded - fix their time by hand.${why}`;
  }
  const note = input.note ? ` "${clip(input.note, 200)}"` : "";
  return `${name} removed an unsent shift comment from ${whenText(input.madeAtMs)}.${note} It was never saved.${why}`;
}

async function alreadyOnServer(companyId: string, input: ReportRemovedItemInput): Promise<boolean> {
  const col = input.kind === "punch" ? "clockEvents" : "shiftNotes";
  const snap = await db.collection("companies").doc(companyId).collection(col).doc(input.requestId).get();
  return snap.exists;
}

export const reportRemovedItem = onCall(async (request): Promise<ReportRemovedItemResult> => {
  const caller = await ownQueueCaller(request);
  const parsed = reportRemovedItemSchema.safeParse(request.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid removal report.");
  const input = parsed.data;
  const { companyId, employeeId, employee } = caller;

  if (await alreadyOnServer(companyId, input)) return { ok: true, alerted: false };

  const nowMs = Date.now();
  // The phone's clock: never in the future of the server's.
  const occurredAt = admin.firestore.Timestamp.fromMillis(Math.min(input.removedAtMs, nowMs));
  const dateKey = localDateKey(new Date(Math.min(input.madeAtMs, nowMs)));

  const sameDay = await db
    .collection("companies")
    .doc(companyId)
    .collection("alerts")
    .where("alertType", "==", "punchRemoved")
    .where("employeeId", "==", employeeId)
    .where("dateKey", "==", dateKey)
    .count()
    .get();
  if (sameDay.data().count >= MAX_REMOVED_ALERTS_PER_DAY) return { ok: true, alerted: false };

  const name = typeof employee.name === "string" && employee.name.trim() ? employee.name.trim() : "An employee";
  const alert = await createAlertIfNew(
    {
      companyId,
      alertType: "punchRemoved",
      employeeId,
      employeeName: typeof employee.name === "string" ? employee.name : null,
      siteId: null,
      siteName: null,
      message: removedItemMessage(name, input),
      eventId: input.requestId,
      employeeUpdateId: null,
      dateKey,
    },
    occurredAt
  );
  if (alert) return { ok: true, alerted: true };
  // createAlertIfNew answers null both for "already there" (a resend) and
  // for a failed write. Only the first is done: on a failed write the phone
  // must keep the report and try again, never drop it.
  const existing = await db.doc(`companies/${companyId}/alerts/removed-${input.requestId}-${dateKey}`).get();
  if (!existing.exists) throw new HttpsError("unavailable", "Couldn't save the report. It will be sent again.");
  return { ok: true, alerted: false };
});
