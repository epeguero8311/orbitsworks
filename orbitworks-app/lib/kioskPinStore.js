import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { findEmployeeByHash, findUnlockerByHash, hashInput, parsePinTable, toChunks } from "./kioskLogic";

// Task 5 Kiosk mode (K12) - the PIN table on the iPad.
//
// getKioskPinTable hands out, per active employee, a SALTED sha256 of their
// PIN (a new salt every call) - never a plain PIN, never pay or other
// personal data. Kept in SecureStore (the keychain; this iPad only, only
// while unlocked), in chunks (some iOS releases refused values over ~2 KB).
// A typed PIN is hashed the same way and looked up locally, so the pad
// answers at once, online or offline. The server checks the real PIN again
// on every punch it receives (kioskPunch).
//
// Refreshed: app open, the Home pad coming back, every 20 minutes, on
// reconnect, and after the server refused a PIN (useKioskSync). Signing out
// (Exit Kiosk) deletes it.
//
// Never logs a PIN or a hash.

const SECURE_OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const COUNT_KEY = (uid) => `kioskTable.${uid}.n`;
const CHUNK_KEY = (uid, i) => `kioskTable.${uid}.${i}`;

const getTableFn = httpsCallable(functions, "getKioskPinTable", { timeout: 20000 });

let current = null; // { uid, table }
let status = { state: "idle", reason: null }; // state: idle | ok | error ; reason: inactive | notKiosk | kioskOff | null
const listeners = new Set();
let inFlight = null;

// A stable object for useSyncExternalStore: replaced only when something
// changed (notify), never built fresh on every read.
let snapshot = { table: null, status };

function notify() {
  snapshot = { table: current ? current.table : null, status };
  for (const l of listeners) {
    try {
      l();
    } catch {
      // A listener's own problem never stops the others.
    }
  }
}

export function subscribeKioskTable(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getKioskTableSnapshot() {
  return snapshot;
}

async function readSaved(uid) {
  try {
    const n = Number(await SecureStore.getItemAsync(COUNT_KEY(uid), SECURE_OPTS));
    if (!Number.isInteger(n) || n <= 0 || n > 500) return null;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(CHUNK_KEY(uid, i), SECURE_OPTS);
      if (part === null) return null;
      parts.push(part);
    }
    return parsePinTable(JSON.parse(parts.join("")).raw);
  } catch {
    return null;
  }
}

async function writeSaved(uid, raw) {
  const chunks = toChunks(JSON.stringify({ raw }));
  const oldN = Number(await SecureStore.getItemAsync(COUNT_KEY(uid), SECURE_OPTS).catch(() => null)) || 0;
  for (let i = 0; i < chunks.length; i++) {
    await SecureStore.setItemAsync(CHUNK_KEY(uid, i), chunks[i], SECURE_OPTS);
  }
  await SecureStore.setItemAsync(COUNT_KEY(uid), String(chunks.length), SECURE_OPTS);
  for (let i = chunks.length; i < oldN; i++) {
    await SecureStore.deleteItemAsync(CHUNK_KEY(uid, i), SECURE_OPTS).catch(() => {});
  }
}

// Exit Kiosk / sign out: nothing of the table stays on the iPad.
export async function forgetKioskTable(uid) {
  const n = Number(await SecureStore.getItemAsync(COUNT_KEY(uid), SECURE_OPTS).catch(() => null)) || 0;
  for (let i = 0; i < Math.max(n, 1); i++) {
    await SecureStore.deleteItemAsync(CHUNK_KEY(uid, i), SECURE_OPTS).catch(() => {});
  }
  await SecureStore.deleteItemAsync(COUNT_KEY(uid), SECURE_OPTS).catch(() => {});
  if (current && current.uid === uid) current = null;
  status = { state: "idle", reason: null };
  notify();
}

// The saved table, before the first server answer of this app run.
export async function loadKioskTable(uid) {
  if (current && current.uid === uid) return current.table;
  const saved = await readSaved(uid);
  if (saved && !(current && current.uid === uid)) {
    current = { uid, table: saved };
    notify();
  }
  return saved;
}

// Pulls a fresh table. Calls at the same time share one request. A failed
// call keeps the table already on the iPad (offline = keep working).
export function syncKioskTable(uid) {
  if (!uid) return Promise.resolve(null);
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await getTableFn({});
      const table = parsePinTable(res.data);
      if (!table) throw new Error("bad table");
      current = { uid, table };
      status = { state: "ok", reason: null };
      notify();
      await writeSaved(uid, res.data).catch(() => {});
      return table;
    } catch (err) {
      const reason = err && err.details && err.details.reason;
      // inactive / notKiosk / kioskOff are the server's answer about THIS
      // login - Home shows them. Anything else is signal: keep going.
      status = { state: "error", reason: ["inactive", "notKiosk", "kioskOff"].includes(reason) ? reason : null };
      notify();
      return current ? current.table : null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function hashPin(salt, pin) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hashInput(salt, pin));
}

// The employee for a typed PIN, or null.
export async function lookupKioskPin(pin) {
  const table = current ? current.table : null;
  if (!table) return null;
  return findEmployeeByHash(table, await hashPin(table.salt, pin));
}

// K17: an admin's own PIN that opens Kiosk Settings, or null.
export async function lookupKioskUnlocker(pin) {
  const table = current ? current.table : null;
  if (!table) return null;
  return findUnlockerByHash(table, await hashPin(table.salt, pin));
}
