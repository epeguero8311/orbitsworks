// Employee App sign-up (crew code) checks. CommonJS so test/joinSignup.test.js
// can run them in plain Node.
//
// These only give quick, plain feedback on the phone. joinCompany on the
// server is the real check (joinCompanyValidators.ts in the functions
// package) - keep the limits here in step with it by hand.

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const MAX_AGE = 120;
// Same as SELFIE_MAX_BYTES on the server.
const SELFIE_MAX_BYTES = 4 * 1024 * 1024;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateFullName(raw) {
  const value = String(raw ?? "").trim();
  if (value.length < NAME_MIN_LENGTH) return { ok: false, value, error: "Enter your full name." };
  if (value.length > NAME_MAX_LENGTH) return { ok: false, value, error: "That name is too long." };
  return { ok: true, value, error: null };
}

function validateEmail(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value.length === 0 || value.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(value)) {
    return { ok: false, value, error: "Enter a valid email." };
  }
  return { ok: true, value, error: null };
}

function validatePassword(raw) {
  const value = String(raw ?? "");
  if (value.length < PASSWORD_MIN_LENGTH) return { ok: false, value, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  if (value.length > PASSWORD_MAX_LENGTH) return { ok: false, value, error: "That password is too long." };
  return { ok: true, value, error: null };
}

// Whole years between y-m-d and now (UTC), same math as the server's ageOn.
function ageOn(y, m, d, now) {
  let age = now.getUTCFullYear() - y;
  const month = now.getUTCMonth() + 1;
  if (month < m || (month === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

const pad2 = (n) => String(n).padStart(2, "0");

// The three birthday boxes -> "YYYY-MM-DD", or a plain error.
function checkBirthday({ mm, dd, yyyy }, minAge, now = new Date()) {
  const ms = String(mm ?? "").trim();
  const ds = String(dd ?? "").trim();
  const ys = String(yyyy ?? "").trim();
  if (!/^\d{1,2}$/.test(ms) || !/^\d{1,2}$/.test(ds) || !/^\d{4}$/.test(ys)) {
    return { ok: false, error: "Enter your full date of birth." };
  }
  const m = Number(ms);
  const d = Number(ds);
  const y = Number(ys);
  const date = new Date(Date.UTC(y, m - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  if (!real || date.getTime() > now.getTime() || ageOn(y, m, d, now) > MAX_AGE) {
    return { ok: false, error: "Enter a real date of birth." };
  }
  if (ageOn(y, m, d, now) < minAge) {
    return { ok: false, error: `You must be at least ${minAge} to sign up.` };
  }
  return { ok: true, iso: `${y}-${pad2(m)}-${pad2(d)}` };
}

function base64Bytes(b64) {
  if (typeof b64 !== "string" || b64.length === 0) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function selfieTooLarge(b64) {
  return base64Bytes(b64) > SELFIE_MAX_BYTES;
}

// ---- joinCompany / getJoinInfo errors -> what the app does ----
//
// kind tells the sign-up flow where to send the person:
//   inactive      dead-end "no longer active" screen (accountProblem too)
//   consent       re-fetch the consent text, back to Screen 1
//   email         Screen 1, error on the email box
//   subcontractor re-fetch the list, Screen 2
//   photo         Screen 2, retake the selfie
//   field         Screen 2, server's plain message
//   retry         nothing wrong with the form - try again
const NO_LONGER_ACTIVE = "This crew code is no longer active. Ask your admin for a new QR code.";
const CONNECTION = "Couldn't reach OrbitsWorks. Check your connection and try again.";

const REASONS = {
  inactive: { kind: "inactive", message: NO_LONGER_ACTIVE },
  accountProblem: { kind: "inactive", message: NO_LONGER_ACTIVE },
  consentVersion: { kind: "consent", message: "The privacy policy or face check consent was updated. Please read it and check the boxes again." },
  emailInUse: { kind: "email", message: "An account with this email already exists. Sign in instead, or use a different email." },
  subcontractor: { kind: "subcontractor", message: "That company option isn't available on this code anymore. Pick another." },
  photo: { kind: "photo", message: "That photo couldn't be used. Retake your selfie." },
  generic: { kind: "retry", message: "Something went wrong. Try again." },
};

function mapJoinError(err) {
  const reason = err && err.details && typeof err.details.reason === "string" ? err.details.reason : null;
  if (reason === "invalid") {
    const msg = typeof err.message === "string" && err.message.length > 0 && err.message.length < 200 ? err.message : "Check your details and try again.";
    return { kind: "field", message: msg };
  }
  if (reason && REASONS[reason]) return REASONS[reason];
  return { kind: "retry", message: CONNECTION };
}

// getJoinInfo's answer, checked before the screens use it. Anything
// unexpected is treated like a network error (Retry), never as a dead code.
function parseJoinInfo(data) {
  if (data && data.status === "inactive") return { status: "inactive" };
  const ok =
    data &&
    data.status === "active" &&
    typeof data.companyName === "string" &&
    typeof data.privacyPolicyVersion === "string" &&
    typeof data.biometricConsentVersion === "string" &&
    typeof data.biometricConsentText === "string" &&
    Number.isInteger(data.minSignupAge) &&
    Array.isArray(data.subcontractors) &&
    data.subcontractors.every((s) => s && typeof s.id === "string" && typeof s.name === "string");
  if (!ok) return null;
  return {
    status: "active",
    companyName: data.companyName,
    subcontractors: data.subcontractors.map((s) => ({ id: s.id, name: s.name })),
    privacyPolicyVersion: data.privacyPolicyVersion,
    biometricConsentVersion: data.biometricConsentVersion,
    biometricConsentText: data.biometricConsentText,
    minSignupAge: data.minSignupAge,
  };
}

module.exports = {
  NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  SELFIE_MAX_BYTES,
  NO_LONGER_ACTIVE,
  validateFullName,
  validateEmail,
  validatePassword,
  checkBirthday,
  base64Bytes,
  selfieTooLarge,
  mapJoinError,
  parseJoinInfo,
};
