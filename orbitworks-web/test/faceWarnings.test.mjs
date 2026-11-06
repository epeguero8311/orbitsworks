// Timesheet Approvals face warnings (lib/faceWarnings.ts): the main "Face
// recognition alerts" switch plus the two sub-toggles (2026-11-06).
// Plain Node, no emulator. Run: node --test test/faceWarnings.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { faceWarningType, FACE_LOW_CONFIDENCE_FLOOR } from "../lib/faceWarnings.ts";

const ON = { faceNoFaceAlert: true, faceMismatchAlert: true };
const MAIN_ON = { alertsEnabled: true };
const noFace = { status: "noFace", similarity: null };
const mismatch = { status: "mismatch", similarity: 38.1 };
const low = { status: "mismatch", similarity: 82 };
const match = { status: "match", similarity: 97 };

test("no face and no match are separate warnings; a match or no check gives none", () => {
  assert.equal(faceWarningType(noFace, ON, MAIN_ON), "faceNoFace");
  assert.equal(faceWarningType(mismatch, ON, MAIN_ON), "faceMismatch");
  assert.equal(faceWarningType(low, ON, MAIN_ON), "faceLowConfidence");
  assert.equal(faceWarningType({ status: "mismatch", similarity: FACE_LOW_CONFIDENCE_FLOOR }, ON, MAIN_ON), "faceLowConfidence");
  assert.equal(faceWarningType(match, ON, MAIN_ON), null);
  assert.equal(faceWarningType(null, ON, MAIN_ON), null);
});

test("'No face detected' off: only the no-face warning goes", () => {
  const alerts = { ...ON, faceNoFaceAlert: false };
  assert.equal(faceWarningType(noFace, alerts, MAIN_ON), null);
  assert.equal(faceWarningType(mismatch, alerts, MAIN_ON), "faceMismatch");
});

test("'Face didn't match' off: mismatch and low confidence go, no face stays", () => {
  const alerts = { ...ON, faceMismatchAlert: false };
  assert.equal(faceWarningType(mismatch, alerts, MAIN_ON), null);
  assert.equal(faceWarningType(low, alerts, MAIN_ON), null);
  assert.equal(faceWarningType(noFace, alerts, MAIN_ON), "faceNoFace");
});

test("main switch off: nothing, whatever the sub-toggles say", () => {
  for (const fc of [noFace, mismatch, low]) assert.equal(faceWarningType(fc, ON, { alertsEnabled: false }), null);
});

test("companies saved before the sub-toggles existed (keys missing) count as on", () => {
  assert.equal(faceWarningType(noFace, {}, MAIN_ON), "faceNoFace");
  assert.equal(faceWarningType(mismatch, {}, MAIN_ON), "faceMismatch");
});
