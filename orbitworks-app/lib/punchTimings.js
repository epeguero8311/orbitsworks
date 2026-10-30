import * as FileSystem from "expo-file-system/legacy";
import { FIREBASE_PROJECT_ID } from "./firebase";
import { FIREBASE_PROJECTS } from "../config/envRules";
import { addTiming, stepDurations } from "./punchTimingFormat";

// DEV BUILD ONLY: how long each step of a punch took, shown in the Settings
// tab so timings can be read on a TestFlight build (no console there).
// Off unless the app talks to the dev Firebase project, so a prod build
// never records or shows anything. Stores only the action, step times,
// photo size and an error code - never a name, id, PIN or photo.
// The last 10 are kept in a small file so they survive killing the app.

export const TIMINGS_ENABLED = FIREBASE_PROJECT_ID === FIREBASE_PROJECTS.dev;

const FILE = `${FileSystem.documentDirectory}punch-timings.json`;
let entries = [];
let loaded = false;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(entries);
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await FileSystem.readAsStringAsync(FILE);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) entries = parsed;
  } catch {
    // No file yet, or unreadable - start empty.
  }
}

async function save() {
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(entries));
  } catch {
    // Dev readout only - never let it break a punch.
  }
}

export async function readTimings() {
  if (!TIMINGS_ENABLED) return [];
  await load();
  return entries;
}

export function subscribeTimings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// One timer per punch screen. mark() notes when a step ended; finish()
// saves one entry per attempt (a wrong PIN, then the punch that worked).
// Every call is a no-op outside the dev build.
export function startPunchTimer(action) {
  const marks = { start: Date.now() };
  let photoBytes = null;
  return {
    mark(name) {
      if (TIMINGS_ENABLED) marks[name] = Date.now();
    },
    notePhoto(uri) {
      if (!TIMINGS_ENABLED || !uri) return;
      FileSystem.getInfoAsync(uri)
        .then((info) => {
          if (info.exists && Number.isFinite(info.size)) photoBytes = info.size;
        })
        .catch(() => {});
    },
    async finish(outcome) {
      if (!TIMINGS_ENABLED) return;
      marks.end = Date.now();
      await load();
      entries = addTiming(entries, { action, at: marks.start, outcome, steps: stepDurations({ ...marks }), photoBytes });
      notify();
      save();
    },
  };
}

// Short, PII-free outcome for a failed attempt (the server's reason code).
export function outcomeOf(err) {
  return String(err?.details?.reason || err?.code || "error").slice(0, 40);
}
