// Rate limits for the public Employee App sign-up callables
// (prod-readiness item 8 A): getJoinInfo, joinCompany, getInviteInfo,
// acceptEmployeeInvite. Anyone can call these without an account, so each
// is capped per network (IP) and per crew code / invite link. Only the new
// Employee App calls them - no live app or website does - and nothing here
// touches a clock-in/out.
//
// Sized for a whole crew joining on one jobsite Wi-Fi (one shared IP):
//   ipInfo        60 code/invite lookups per IP per 10 min
//   ipSignup      30 sign-up attempts per IP per 10 min
//   codeSignup    30 successful sign-ups per crew code per hour
//   inviteAttempt 10 sign-up attempts per invite link per hour
//
// Fixed-window counters in publicRateLimits/{sha256(kind:value)}
// (server-only - firestore.rules' catch-all denies clients). The doc id is a
// hash, so no IP address or token is stored in readable form; expiresAt is
// for a Firestore TTL policy to clear old windows.

import { createHash } from "node:crypto";
import * as admin from "firebase-admin";
import { db } from "../shared";

export const PUBLIC_LIMITS = {
  ipInfo: { max: 60, windowMs: 10 * 60 * 1000 },
  ipSignup: { max: 30, windowMs: 10 * 60 * 1000 },
  codeSignup: { max: 30, windowMs: 60 * 60 * 1000 },
  inviteAttempt: { max: 10, windowMs: 60 * 60 * 1000 },
} as const;

export type PublicLimitKind = keyof typeof PUBLIC_LIMITS;

export const TOO_MANY_MESSAGE = "Too many tries right now. Wait a few minutes and try again.";

const COLLECTION = "publicRateLimits";

function limitRef(kind: PublicLimitKind, value: string) {
  const id = createHash("sha256").update(`${kind}:${value}`, "utf8").digest("hex");
  return db.collection(COLLECTION).doc(id);
}

// The caller's IP as Cloud Functions sees it (rawRequest.ip; the first
// X-Forwarded-For hop as the fallback). null when unknown (tests, or a
// request without one) - then the per-IP limits are skipped, never fail.
export function clientIp(rawRequest: unknown): string | null {
  const req = rawRequest as { ip?: unknown; headers?: Record<string, unknown> } | undefined;
  if (req && typeof req.ip === "string" && req.ip.length > 0 && req.ip.length <= 100) return req.ip;
  const fwd = req?.headers?.["x-forwarded-for"];
  const first = typeof fwd === "string" ? fwd.split(",")[0].trim() : "";
  return first && first.length <= 100 ? first : null;
}

// Pure window maths (tested): the count after this attempt, and whether it
// is allowed. A window older than windowMs starts over.
export function nextWindow(
  existing: { count?: unknown; windowStartMs?: unknown } | undefined,
  nowMs: number,
  windowMs: number
): { count: number; windowStartMs: number } {
  const start = typeof existing?.windowStartMs === "number" ? existing.windowStartMs : 0;
  const count = typeof existing?.count === "number" ? existing.count : 0;
  if (nowMs - start >= windowMs || start > nowMs) return { count: 0, windowStartMs: nowMs };
  return { count, windowStartMs: start };
}

async function bump(kind: PublicLimitKind, value: string, check: boolean, count: boolean, nowMs: number): Promise<boolean> {
  const { max, windowMs } = PUBLIC_LIMITS[kind];
  const ref = limitRef(kind, value);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const w = nextWindow(snap.data(), nowMs, windowMs);
    if (check && w.count >= max) return false;
    if (count) {
      tx.set(ref, {
        kind,
        count: w.count + 1,
        windowStartMs: w.windowStartMs,
        expiresAt: admin.firestore.Timestamp.fromMillis(w.windowStartMs + windowMs),
      });
    }
    return true;
  });
}

// Counts this attempt; false = over the limit (not counted).
export function hitRateLimit(kind: PublicLimitKind, value: string, nowMs = Date.now()): Promise<boolean> {
  return bump(kind, value, true, true, nowMs);
}

// Checks only (e.g. a crew code's successful sign-ups before trying one).
export function underRateLimit(kind: PublicLimitKind, value: string, nowMs = Date.now()): Promise<boolean> {
  return bump(kind, value, true, false, nowMs);
}

// Counts without checking (after a sign-up succeeded). Never throws - a
// counter hiccup must not turn a finished sign-up into an error.
export async function countRateLimit(kind: PublicLimitKind, value: string, nowMs = Date.now()): Promise<void> {
  try {
    await bump(kind, value, false, true, nowMs);
  } catch (err) {
    console.warn("publicRateLimit: count failed", { kind, error: String((err as Error)?.message ?? err) });
  }
}

// The per-IP check for one of the four callables. Skipped when the IP is
// unknown.
export async function ipAllowed(kind: "ipInfo" | "ipSignup", rawRequest: unknown): Promise<boolean> {
  const ip = clientIp(rawRequest);
  if (!ip) return true;
  return hitRateLimit(kind, ip);
}

// The token a request names, for the per-code / per-invite limits (only a
// sane string; the callable's own schema still validates it properly).
export function tokenOf(data: unknown): string | null {
  const t = (data as { token?: unknown } | null | undefined)?.token;
  return typeof t === "string" && t.length > 0 && t.length <= 200 ? t : null;
}
