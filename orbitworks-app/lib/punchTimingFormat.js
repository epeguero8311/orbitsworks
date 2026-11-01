// Pure helpers for the dev-only punch timing readout (lib/punchTimings.js).
// No React or Expo imports, so plain Node tests can load this file.

export const MAX_TIMINGS = 10;

// Each step's time from the marks taken during one punch. A step whose
// start or end mark is missing comes back null (e.g. breaks have no PIN).
//   marks: { start, pinTyped, cameraOpen, pinChecked, photoTaken, sendStart,
//            uploaded, punched, end }
// Builds before the fast punch flow had no cameraOpen (the camera opened
// after the PIN check) and sent the punch on screen (uploaded / punched).
// Now the success shows from the phone's queue: successMs = photo (or the
// break tap) -> green screen. The queue's own send is a separate entry.
export function stepDurations(marks) {
  const between = (a, b) => (Number.isFinite(marks[a]) && Number.isFinite(marks[b]) ? Math.max(0, marks[b] - marks[a]) : null);
  const endMark = Number.isFinite(marks.punched) ? "punched" : "end";
  const sentOnScreen = Number.isFinite(marks.punched);
  return {
    typingMs: between("start", "pinTyped"),
    pinCheckMs: between("pinTyped", "pinChecked"),
    cameraMs: Number.isFinite(marks.cameraOpen) ? between("cameraOpen", "photoTaken") : between("pinChecked", "photoTaken"),
    uploadMs: between("photoTaken", "uploaded"),
    punchMs: Number.isFinite(marks.uploaded) ? between("uploaded", "punched") : between("sendStart", "punched"),
    successMs: sentOnScreen ? null : Number.isFinite(marks.photoTaken) ? between("photoTaken", "end") : between("sendStart", "end"),
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
  ["successMs", "to success"],
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
