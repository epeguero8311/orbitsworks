import { randomBytes, timingSafeEqual } from "crypto";
import { pinVerifierHash } from "./pinVerifier";

// ---- Employee App Phase 5: earlier PINs (replaces Redo) ----
//
// A punch saved offline with the PIN that was right at that moment must
// still sync after an admin changed the PIN; a punch made AFTER the change
// with the old PIN must not. So every PIN change keeps the old PIN here,
// in companies/{c}/employeePinHistory/{employeeId} (server-only, admins
// included - firestore.rules), as a salted hash (same hash as the PIN
// verifier) with the time it was active: fromMs <= t < untilMs.
//
// untilMs is the server's time when the change landed (decided 2026-11-03,
// Q6 A). Kept for 24 h, the oldest queued punch the server takes
// (QUEUED_MAX_AGE_MS), at most PIN_HISTORY_MAX_ENTRIES. Pure: no Firestore,
// so test/pinHistory.test.js runs it without the emulator.
//
// A queued punch passes with an old PIN only when (Q2 A):
//   - the PIN matches the entry active at the punch's own time (the
//     server's time for a fast sync, see employeeClockQueued.ts)
//   - that change was less than 24 h ago and the punch is within 24 h
//   - the phone clock was not set back (phoneClockOff)

export const PIN_HISTORY_KEEP_MS = 24 * 60 * 60 * 1000;
export const PIN_HISTORY_MAX_ENTRIES = 20;
const SALT_BYTES = 16;

export type PinHistoryEntry = { salt: string; hash: string; fromMs: number; untilMs: number };
export type PinHistoryData = { entries: PinHistoryEntry[]; lastChangeMs: number | null };
export type QueuedPinResult = "current" | "old" | "wrong";

const isMs = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isEntry(v: unknown): v is PinHistoryEntry {
  const e = v as PinHistoryEntry | null;
  return !!e && typeof e.salt === "string" && typeof e.hash === "string" && isMs(e.fromMs) && isMs(e.untilMs);
}

// The stored doc -> clean data (anything malformed is dropped).
export function readPinHistory(raw: unknown): PinHistoryData {
  const data = (raw ?? {}) as { entries?: unknown; lastChangeMs?: unknown };
  const entries = Array.isArray(data.entries) ? data.entries.filter(isEntry) : [];
  return { entries, lastChangeMs: isMs(data.lastChangeMs) ? data.lastChangeMs : null };
}

// Entries still useful at nowMs: changed less than 24 h ago, oldest first,
// the newest PIN_HISTORY_MAX_ENTRIES.
function keptEntries(entries: PinHistoryEntry[], nowMs: number): PinHistoryEntry[] {
  return entries
    .filter((e) => e.untilMs > nowMs - PIN_HISTORY_KEEP_MS)
    .sort((a, b) => a.untilMs - b.untilMs)
    .slice(-PIN_HISTORY_MAX_ENTRIES);
}

// One PIN change at changeMs: oldPin becomes an entry, active from the last
// change (or fallbackFromMs, e.g. fieldEditedAt.pin, when there was none)
// until now. An old PIN that isn't 4 digits adds no entry.
export function addPinChange(history: PinHistoryData, oldPin: unknown, changeMs: number, fallbackFromMs: number): PinHistoryData {
  const entries = [...history.entries];
  if (typeof oldPin === "string" && /^\d{4}$/.test(oldPin)) {
    const salt = randomBytes(SALT_BYTES).toString("base64url");
    const fromMs = Math.min(history.lastChangeMs ?? fallbackFromMs ?? 0, changeMs);
    entries.push({ salt, hash: pinVerifierHash(salt, oldPin), fromMs, untilMs: changeMs });
  }
  return { entries: keptEntries(entries, changeMs), lastChangeMs: changeMs };
}

// The earlier PIN active at eventMs, or null (the current PIN was active,
// or the time is older than 24 h). Entries changed 24 h+ ago are ignored.
export function pinActiveEntry(entries: PinHistoryEntry[], eventMs: number, nowMs: number): PinHistoryEntry | null {
  if (nowMs - eventMs > PIN_HISTORY_KEEP_MS) return null;
  const hit = keptEntries(entries, nowMs).filter((e) => e.fromMs <= eventMs && eventMs < e.untilMs);
  return hit.length ? hit[hit.length - 1] : null;
}

function entryMatches(entry: PinHistoryEntry, pin: string): boolean {
  const given = Buffer.from(pinVerifierHash(entry.salt, pin));
  const stored = Buffer.from(entry.hash);
  return given.length === stored.length && timingSafeEqual(given, stored);
}

// The PIN on a queued punch: "current" (the PIN on the employee doc -
// unchanged from Phase 4), "old" (the right PIN for the punch's time, since
// changed) or "wrong".
export function queuedPinCheck(input: {
  pin: string;
  currentMatches: boolean;
  history: PinHistoryData;
  eventMs: number;
  nowMs: number;
  phoneClockOff: boolean;
}): QueuedPinResult {
  if (input.currentMatches) return "current";
  if (input.phoneClockOff) return "wrong";
  const entry = pinActiveEntry(input.history.entries, input.eventMs, input.nowMs);
  return entry && entryMatches(entry, input.pin) ? "old" : "wrong";
}
