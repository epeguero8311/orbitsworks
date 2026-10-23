// ---- Employee App sign-up: current consent versions ----
//
// The ONE place the current versions live. joinCompany rejects a sign-up
// that accepted any other version, and the app reads these (and the short
// biometric text) from the server instead of hardcoding them - Part C's
// join-info call returns this object as-is.
//
// PRIVACY_POLICY_VERSION must match TERMS_VERSION in the website's
// components/legal/TermsContent.tsx (the privacy and biometric policy pages
// show that same version). Keep both in sync by hand - this package can't
// import across the web boundary.
//
// Changing BIOMETRIC_CONSENT_TEXT in any way means bumping
// BIOMETRIC_CONSENT_VERSION, so every stored consent record points at the
// exact words the person agreed to.

export const PRIVACY_POLICY_VERSION = "2026-10-14-r5";

export const BIOMETRIC_CONSENT_VERSION = "employee-signup-2026-10-23-v1";

export const BIOMETRIC_CONSENT_TEXT =
  "I agree that my employer can use my photo for face checks when I clock in " +
  "and out, to confirm it is really me. My signup selfie becomes my reference " +
  "photo. Clock-in photos are compared to it using Amazon Rekognition. Photos " +
  "are only used for these checks, are never sold, and are deleted on the " +
  "schedule in the OrbitsWorks Biometric Data Policy. I can ask my employer " +
  "to delete my face data at any time.";

export const CONSENT_VERSIONS = {
  privacyPolicyVersion: PRIVACY_POLICY_VERSION,
  biometricConsentVersion: BIOMETRIC_CONSENT_VERSION,
  biometricConsentText: BIOMETRIC_CONSENT_TEXT,
} as const;
