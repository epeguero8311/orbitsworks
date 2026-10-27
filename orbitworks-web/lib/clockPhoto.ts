import type { ClockEvent } from "@/lib/types";

// What to show where a clock event's photo goes. Pure, no Firebase - unit
// tested in test/clockPhoto.test.mjs.
//   "show"    - photoUrl is set (the image component still falls back to
//               the placeholder if the file fails to load)
//   "removed" - a retention sweep deleted it (photoRemovedAt), or an older
//               event with no marker whose photoUrl is gone but that has a
//               face check result (a face check proves a photo existed)
//   "none"    - no photo was ever recorded (or we can't tell - an older
//               event with no marker and no face check)
export type ClockPhotoState = "show" | "removed" | "none";

export const PHOTO_REMOVED_TEXT = "Photo removed";
export const NO_PHOTO_TEXT = "No photo recorded";
export const NO_PROFILE_PHOTO_TEXT = "No profile photo";

type PhotoFields = Pick<ClockEvent, "photoUrl" | "photoRemovedAt" | "faceCheck">;

export function clockPhotoState(event: PhotoFields): ClockPhotoState {
  if (event.photoRemovedAt) return "removed";
  if (event.photoUrl) return "show";
  if (event.faceCheck) return "removed";
  return "none";
}

// Short label for table cells ("View" / "Removed" / "-").
export function clockPhotoCellLabel(event: PhotoFields): string {
  const state = clockPhotoState(event);
  if (state === "show") return "View";
  if (state === "removed") return "Removed";
  return "-";
}

// The face check result in words, shown next to the photos even when the
// photo itself is gone: "Match 96.4%", "Mismatch 41.5%", "No face".
export function faceResultText(faceCheck: ClockEvent["faceCheck"]): string | null {
  if (!faceCheck) return null;
  const pct = faceCheck.similarity != null ? ` ${faceCheck.similarity}%` : "";
  if (faceCheck.status === "match") return `Match${pct}`;
  if (faceCheck.status === "mismatch") return `Mismatch${pct}`;
  if (faceCheck.status === "noFace") return "No face";
  return null;
}
