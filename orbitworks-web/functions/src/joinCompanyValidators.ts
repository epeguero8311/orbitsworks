import { z } from "zod";
import { NAME_MAX_LENGTH } from "./createEmployee";

// ---- joinCompany input (Employee App QR sign-up) ----
//
// Checked before anything else in joinCompany. The token rule matches
// joinCodeTokenField in the website's lib/validators/joinCode.ts - keep
// both in sync by hand.

// Youngest age that may sign up. Change here only.
export const MIN_SIGNUP_AGE = 16;
const MAX_SIGNUP_AGE = 120;

// Phones send a compressed JPEG. 4 MB of bytes is ~5.6M base64 chars, well
// under the callable's 10 MB request limit.
export const SELFIE_MAX_BYTES = 4 * 1024 * 1024;
const SELFIE_MAX_BASE64 = Math.ceil(SELFIE_MAX_BYTES / 3) * 4;
const SELFIE_MIN_BYTES = 5 * 1024;

const ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

// Whole years between a YYYY-MM-DD birthday and today (UTC).
export function ageOn(birthday: string, now: Date = new Date()): number {
  const [y, m, d] = birthday.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

// A real calendar date (rejects 2023-02-30 etc), not in the future.
export function isRealPastDate(value: string, now: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real && date.getTime() <= now.getTime();
}

const birthdayField = z
  .string()
  .refine((v) => isRealPastDate(v), "Enter a real date of birth.")
  .refine((v) => !isRealPastDate(v) || ageOn(v) <= MAX_SIGNUP_AGE, "Enter a real date of birth.")
  .refine((v) => !isRealPastDate(v) || ageOn(v) >= MIN_SIGNUP_AGE, `You must be at least ${MIN_SIGNUP_AGE} to sign up.`);

const selfieField = z
  .string()
  .max(SELFIE_MAX_BASE64, "That photo is too large. Retake it.")
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "That photo couldn't be read. Retake it.");

export const joinCompanySchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "Invalid code"),
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(NAME_MAX_LENGTH, "That name is too long."),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email.")),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128, "That password is too long."),
  privacyAccepted: z.literal(true, "You must accept the Privacy Policy."),
  privacyVersion: z.string().max(64),
  biometricConsentAccepted: z.literal(true, "You must agree to the face check consent."),
  biometricConsentVersion: z.string().max(64),
  birthday: birthdayField,
  // null = the company itself (in-house).
  subcontractorId: z.string().regex(ID_REGEX).nullable(),
  selfieBase64: selfieField,
});

export type JoinCompanyInput = z.infer<typeof joinCompanySchema>;

// JPEG bytes start FF D8 FF. Returns null for anything else or a bad size.
export function decodeSelfie(base64: string): Buffer | null {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < SELFIE_MIN_BYTES || bytes.length > SELFIE_MAX_BYTES) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return bytes;
}

// Same person check for the duplicate flag: case, accents and extra spaces
// don't matter.
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
