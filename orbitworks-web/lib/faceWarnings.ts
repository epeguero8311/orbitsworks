import type { FaceCheck } from "@/lib/types";
import type { Alerts, FaceVerificationSettings } from "@/lib/hooks/useCompanySettings";

// Which Timesheet Approvals face warning one clock event's faceCheck gives,
// or null. Pure, type-only imports, so test/faceWarnings.test.mjs runs it
// under plain Node. Used by lib/sessionWarnings.ts.
//   - faceVerification.alertsEnabled is the main "Face recognition alerts"
//     switch; each type also needs its own sub-toggle (2026-11-06):
//     faceNoFaceAlert / faceMismatchAlert (missing = on). Same gates as the
//     server's alerts (functions/src/alerts.ts).
//   - A mismatch at or above FACE_LOW_CONFIDENCE_FLOOR is "low confidence"
//     (yellow) rather than an outright mismatch (red); both follow the
//     "Face didn't match" sub-toggle.

// Below FACE_MATCH_THRESHOLD (90, functions/src/rekognition.ts) but at or
// above this floor: "low confidence" (yellow) rather than an outright
// mismatch (red).
export const FACE_LOW_CONFIDENCE_FLOOR = 70;

export type FaceWarningType = "faceNoFace" | "faceMismatch" | "faceLowConfidence";

export function faceWarningType(
  faceCheck: Pick<FaceCheck, "status" | "similarity"> | null | undefined,
  alerts: Pick<Alerts, "faceNoFaceAlert" | "faceMismatchAlert">,
  faceVerification: Pick<FaceVerificationSettings, "alertsEnabled">
): FaceWarningType | null {
  if (!faceCheck || !faceVerification.alertsEnabled) return null;
  if (faceCheck.status === "noFace") return alerts.faceNoFaceAlert !== false ? "faceNoFace" : null;
  if (faceCheck.status !== "mismatch" || alerts.faceMismatchAlert === false) return null;
  return faceCheck.similarity != null && faceCheck.similarity >= FACE_LOW_CONFIDENCE_FLOOR ? "faceLowConfidence" : "faceMismatch";
}
