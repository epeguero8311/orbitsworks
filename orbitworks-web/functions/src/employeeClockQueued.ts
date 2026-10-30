import * as admin from "firebase-admin";
import { db, localDateKey } from "./shared";
import { createAlertIfNew } from "./alerts";

// ---- Employee App Phase 4: queued (offline) punches ----
//
// A punch the phone could not send right away (offline or slow signal) is
// saved on the phone and sent later with queuedAtMs = when the employee
// made it. employeeClockPunch (employeeClock.ts) then:
//   - rejects it for good if that time is over 24 h ago (tooOld) or more
//     than 2 minutes in the future (badTime)
//   - in/out: checks the PIN WITHOUT the 3-strike lock. A wrong PIN here is
//     counted per employee over 24 h: the 3rd alerts the admin
//     (syncWrongPin, once per day), and from the 5th every further queued
//     punch for that employee fails for good (syncBlocked) until the wrong
//     PINs are 24 h old. That cap stops the queue being used to guess PINs.
//   - rejects it for good if a later punch is already recorded
//     (superseded - e.g. an auto clock-out ran first)
//   - writes it with the phone's time (never later than now) and
//     queued: true; syncedLate: true only if it reached the server 5+
//     minutes after that time (a quick resend after a slow-signal
//     timeout gets no "Synced late" tag)
// Online punches never reach this file and are unchanged.

export const QUEUED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const QUEUED_MAX_FUTURE_MS = 2 * 60 * 1000;
export const SYNC_PIN_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SYNC_PIN_ALERT_AT = 3;
export const SYNC_PIN_BLOCK_AT = 5;
export const SYNCED_LATE_AFTER_MS = 5 * 60 * 1000;

export const NOT_RECORDED_MESSAGE = "Not recorded, tell your admin.";
export const COULDNT_SYNC_MESSAGE = "Couldn't sync, please speak to your supervisor.";
export const QUEUED_WRONG_PIN_MESSAGE = "Wrong PIN. Type your PIN again to send this punch.";

// null = the time is fine, else the reason the punch is rejected for good.
export function queuedTimeProblem(queuedAtMs: number, nowMs: number): "tooOld" | "badTime" | null {
  if (queuedAtMs - nowMs > QUEUED_MAX_FUTURE_MS) return "badTime";
  if (nowMs - queuedAtMs > QUEUED_MAX_AGE_MS) return "tooOld";
  return null;
}

// The event time for a queued punch: the phone's time, but never after
// the server's now (a phone clock a little ahead must not put a punch in
// the future, before the next online punch).
export function queuedEventMs(queuedAtMs: number, nowMs: number): number {
  return Math.min(queuedAtMs, nowMs);
}

// "Synced late" tag: the punch reached the server 5+ minutes after its
// own time.
export function isSyncedLate(eventMs: number, nowMs: number): boolean {
  return nowMs - eventMs >= SYNCED_LATE_AFTER_MS;
}

// A later (or same-time) punch already recorded means this one can't go in.
export function isSuperseded(queuedEventTimeMs: number, latestEventMs: number | null): boolean {
  return latestEventMs !== null && latestEventMs >= queuedEventTimeMs;
}

// Wrong-PIN-at-sync times still inside the 24 h window.
export function recentFailures(failures: unknown, nowMs: number): number[] {
  if (!Array.isArray(failures)) return [];
  return failures.filter((t): t is number => typeof t === "number" && nowMs - t < SYNC_PIN_WINDOW_MS && t <= nowMs);
}

function failuresRef(companyId: string, employeeId: string) {
  return db.collection("companies").doc(companyId).collection("syncPinFailures").doc(employeeId);
}

// true = this employee already has SYNC_PIN_BLOCK_AT wrong PINs at sync in
// the last 24 h, so queued punches are refused until they age out.
export async function isSyncBlocked(companyId: string, employeeId: string, nowMs: number): Promise<boolean> {
  const snap = await failuresRef(companyId, employeeId).get();
  return recentFailures(snap.data()?.failures, nowMs).length >= SYNC_PIN_BLOCK_AT;
}

// Counts one wrong PIN at sync (a transaction, so two at once both count)
// and alerts the admin from the 3rd in 24 h. Returns the new count. Never
// touches employeePinLocks - a wrong PIN at sync is not part of the
// 3-strike lock.
export async function recordSyncWrongPin(
  companyId: string,
  employeeId: string,
  employeeName: string,
  nowMs: number
): Promise<number> {
  const ref = failuresRef(companyId, employeeId);
  const count = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const kept = [...recentFailures(snap.data()?.failures, nowMs), nowMs];
    tx.set(ref, { failures: kept, updatedAt: admin.firestore.Timestamp.fromMillis(nowMs) });
    return kept.length;
  });
  if (count >= SYNC_PIN_ALERT_AT) {
    // Deterministic id per employee per day (createAlertIfNew uses
    // create()), so a 4th or 5th wrong PIN the same day adds no second alert.
    await createAlertIfNew(
      {
        companyId,
        alertType: "syncWrongPin",
        employeeId,
        employeeName,
        siteId: null,
        siteName: null,
        message: `${count} punches saved offline had a wrong PIN when they synced in the last 24 hours.`,
        eventId: null,
        employeeUpdateId: null,
        dateKey: localDateKey(new Date(nowMs)),
      },
      admin.firestore.Timestamp.fromMillis(nowMs)
    ).catch(() => null);
  }
  return count;
}
