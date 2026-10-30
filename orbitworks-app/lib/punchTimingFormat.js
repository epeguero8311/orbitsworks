// Pure helpers for the dev-only punch timing readout (lib/punchTimings.js).
// No React or Expo imports, so plain Node tests can load this file.

export const MAX_TIMINGS = 10;

// Each step's time from the marks taken during one punch. A step whose
// start or end mark is missing comes back null (e.g. breaks have no PIN).
//   marks: { start, pinTyped, pinChecked, photoTaken, uploaded, punched }
export function stepDurations(marks) {
  const between = (a, b) => (Number.isFinite(marks[a]) && Number.isFinite(marks[b]) ? Math.max(0, marks[b] - marks[a]) : null);
  const endMark = Number.isFinite(marks.punched) ? "punched" : "end";
  return {
    typingMs: between("start", "pinTyped"),
    pinCheckMs: between("pinTyped", "pinChecked"),
    cameraMs: between("pinChecked", "photoTaken"),
    uploadMs: between("photoTaken", "uploaded"),
    punchMs: Number.isFinite(marks.uploaded) ? between("uploaded", "punched") : between("sendStart", "punched"),
    totalMs: between("start", endMark),
  };
}

function seconds(ms) {
  return ms === null ? null : `${(ms / 1000).toFixed(1)}s`;
}

const LABELS = [
  ["typingMs", "PIN typing"],
  ["pinCheckMs", "PIN check"],
  ["cameraMs", "camera"],
  ["uploadMs", "upload"],
  ["punchMs", "punch"],
  ["totalMs", "total"],
];

// One ASCII line per step that has a value, e.g. "PIN check 0.4s".
export function timingLines(entry) {
  const lines = [];
  for (const [key, label] of LABELS) {
    const value = seconds(entry.steps[key] ?? null);
    if (value) lines.push(`${label} ${value}`);
  }
  if (Number.isFinite(entry.photoBytes)) lines.push(`photo ${Math.round(entry.photoBytes / 1024)} KB`);
  return lines;
}

// Newest first, at most MAX_TIMINGS kept.
export function addTiming(list, entry) {
  return [entry, ...list].slice(0, MAX_TIMINGS);
}
