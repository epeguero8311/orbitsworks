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

// r6 (2026-11-04, Employee App Phase 8): the privacy policy and employee
// notice now cover Always location while clocked in on a Pro company with
// a geofenced job site. Bumping this also shows the website's Terms
// re-accept prompt to owners (TERMS_VERSION).
export const PRIVACY_POLICY_VERSION = "2026-11-04-r6";

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

// ---- Employee App Phase 8: location tracking consent ----
//
// Asked once in the app before the "Always" location prompt (after the
// first Pro clock-in at a geofenced job site), and again whenever this
// version or PRIVACY_POLICY_VERSION changes. Stored on
// employeeConsents/{employeeId} by acceptLocationConsent (server-only).
// Changing LOCATION_CONSENT_TEXT in any way means bumping
// LOCATION_CONSENT_VERSION. Lawyer review is a Phase 10 item.
export const LOCATION_CONSENT_VERSION = "employee-location-2026-11-04-v1";

export const LOCATION_CONSENT_TEXT =
  "I agree that while I am clocked in at a job site with a geofence, OrbitsWorks " +
  "can check my phone's location in the background to see when I leave and " +
  "come back to the job site. It only runs while I am clocked in, never when " +
  "I am clocked out. Only the time and place I left and came back are saved, " +
  "never a trail of where I went. My employer sees those times on my shift. " +
  "The places are deleted after 90 days. Leaving never stops a clock-in or " +
  "clock-out. I can turn this off in my phone's Settings at any time.";
