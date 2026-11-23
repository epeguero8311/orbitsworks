// Unit tests for lib/clockPhoto.ts ("Photo removed" placeholder logic).
// Plain Node, no emulator. Node 24+ loads the .ts file directly.
// Run via: node --test test/clockPhoto.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { clockPhotoState, clockPhotoCellLabel, faceResultText } from "../lib/clockPhoto.ts";

const FACE = { status: "mismatch", similarity: 41.5, threshold: 90, referencePhotoUrl: "https://x/ref.jpg", facesInTarget: 1, checkedAt: {} };
const REMOVED_AT = { toMillis: () => 1 };

test("photo present: show it", () => {
  assert.equal(clockPhotoState({ photoUrl: "https://x/p.jpg" }), "show");
  assert.equal(clockPhotoState({ photoUrl: "https://x/p.jpg", faceCheck: FACE }), "show");
  assert.equal(clockPhotoCellLabel({ photoUrl: "https://x/p.jpg" }), "View");
});

test("marked removed by a retention sweep: Photo removed", () => {
  assert.equal(clockPhotoState({ photoRemovedAt: REMOVED_AT }), "removed");
  assert.equal(clockPhotoState({ photoRemovedAt: REMOVED_AT, faceCheck: FACE }), "removed");
  // Marker wins even if a stale URL is still there.
  assert.equal(clockPhotoState({ photoRemovedAt: REMOVED_AT, photoUrl: "https://x/p.jpg" }), "removed");
  assert.equal(clockPhotoCellLabel({ photoRemovedAt: REMOVED_AT }), "Removed");
});

test("older event, no marker, photoUrl gone but has a face check: Photo removed", () => {
  assert.equal(clockPhotoState({ faceCheck: FACE }), "removed");
  assert.equal(clockPhotoCellLabel({ faceCheck: FACE }), "Removed");
});

test("no photo ever (or no marker and no face check): No photo recorded", () => {
  assert.equal(clockPhotoState({}), "none");
  assert.equal(clockPhotoState({ photoUrl: "" }), "none");
  assert.equal(clockPhotoCellLabel({}), "-");
});

test("face result still shows with the photo gone", () => {
  assert.equal(faceResultText(FACE), "Mismatch 41.5%");
  assert.equal(faceResultText({ ...FACE, status: "match", similarity: 96.4 }), "Match 96.4%");
  assert.equal(faceResultText({ ...FACE, status: "noFace", similarity: null }), "No face");
  assert.equal(faceResultText(undefined), null);
});
