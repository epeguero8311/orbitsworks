import * as SecureStore from "expo-secure-store";
import { lockAfterRight, lockAfterWrong, lockSecondsLeft } from "./kioskLogic";

// Task 5 (K14): the iPad's wrong-PIN wait - 3 wrong in a row = 45 s for
// everyone at the tablet. Saved in SecureStore so closing the app doesn't
// reset it. Rules in lib/kioskLogic.js. The server has its own per-kiosk
// limit too (5 wrong a minute, kioskPunch / checkKioskUnlock).

const KEY = "kioskPinLock";
const OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
let cached;

async function read() {
  if (cached !== undefined) return cached;
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTS);
    cached = raw ? JSON.parse(raw) : null;
  } catch {
    cached = null;
  }
  return cached;
}

async function write(state) {
  cached = state;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(state), OPTS);
  } catch {
    // Kept in memory for this run at least.
  }
}

export async function kioskLockSecondsLeft(nowMs = Date.now()) {
  return lockSecondsLeft(await read(), nowMs);
}

// -> seconds of wait now running (0 = none yet).
export async function recordKioskWrongPin(nowMs = Date.now()) {
  const next = lockAfterWrong(await read(), nowMs);
  await write(next);
  return lockSecondsLeft(next, nowMs);
}

export async function recordKioskRightPin(nowMs = Date.now()) {
  await write(lockAfterRight(await read(), nowMs));
}
