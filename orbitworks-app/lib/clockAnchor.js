import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { getPunchDb, runPunchWrite } from "./punchQueueDb";
import { expectedTimeFrom } from "./punchQueueLogic";

// Employee App: the phone's link between server time and its own uptime
// clock, so a punch's time never has to trust the phone's wall clock.
//   - After every successful employeeClockPunch call the phone saves
//     { serverMs, uptimeMs } (the anchor) in punch_meta.
//   - Each saved punch stores its uptime, the expected time (anchor + uptime
//     since) and this app run's id.
//   - The queue sends the uptime wait when it's known (same app run), and
//     the expected time always - see punchQueueLogic.js (fastWaitMs) and the
//     server's employeeClockQueued.ts (fast sync, phoneClockOff).
// Uptime can't be changed in Settings; it pauses while the phone sleeps and
// starts over after a restart (expectedTimeFrom handles both).

// One id per app run: a killed app starts a new one.
export const APP_RUN_ID = Crypto.randomUUID();

const ANCHOR_KEY = "clockAnchor";
let cached;

export async function uptimeNow() {
  try {
    const ms = await Device.getUptimeAsync();
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

async function readAnchor() {
  if (cached !== undefined) return cached;
  try {
    const db = await getPunchDb();
    const row = await db.getFirstAsync("SELECT value FROM punch_meta WHERE key = ?", [ANCHOR_KEY]);
    const parsed = row ? JSON.parse(row.value) : null;
    cached = parsed && Number.isFinite(parsed.serverMs) && Number.isFinite(parsed.uptimeMs) ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

// serverNowMs from a reply; uptime read before and after the call (the
// middle is used).
async function saveAnchor(serverNowMs, uptimeBefore, uptimeAfter) {
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(uptimeBefore) || !Number.isFinite(uptimeAfter)) return;
  const anchor = { serverMs: serverNowMs, uptimeMs: Math.round((uptimeBefore + uptimeAfter) / 2) };
  cached = anchor;
  const db = await getPunchDb();
  await runPunchWrite(() =>
    db.runAsync("INSERT OR REPLACE INTO punch_meta (key, value) VALUES (?, ?)", [ANCHOR_KEY, JSON.stringify(anchor)])
  );
}

// Runs one server call and saves the anchor from its reply. Never slows
// or breaks the call itself.
export async function withAnchor(call) {
  const before = await uptimeNow();
  const res = await call();
  const after = await uptimeNow();
  const serverNowMs = res && res.data ? res.data.serverNowMs : undefined;
  saveAnchor(serverNowMs, before, after).catch(() => {});
  return res;
}

// For a punch being saved now: its uptime, expected time and app run.
export async function punchClockFields() {
  const uptimeAtMs = await uptimeNow();
  const anchor = await readAnchor();
  return {
    uptimeAtMs: uptimeAtMs === null ? null : Math.round(uptimeAtMs),
    expectedAtMs: expectedTimeFrom(anchor, uptimeAtMs),
    sessionId: APP_RUN_ID,
  };
}
