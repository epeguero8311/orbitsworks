import { adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

const USER_DAILY_LIMIT = 50;
const COMPANY_DAILY_LIMIT = 200;
const COOLDOWN_MS = 3000;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "cooldown" | "user_limit" | "company_limit" };

async function checkAndIncrement(docId: string, limit: number): Promise<RateLimitResult> {
  const ref = adminDb.collection("helpChatLimits").doc(docId);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const today = todayStr();
    const now = Date.now();

    if (!snap.exists) {
      tx.set(ref, { date: today, dailyCount: 1, lastRequestAt: Timestamp.now() });
      return { allowed: true };
    }

    const data = snap.data() as { date: string; dailyCount: number; lastRequestAt: Timestamp };
    const lastRequestMs = data.lastRequestAt?.toMillis?.() ?? 0;

    if (now - lastRequestMs < COOLDOWN_MS) {
      return { allowed: false, reason: "cooldown" };
    }

    const isNewDay = data.date !== today;
    const nextCount = isNewDay ? 1 : (data.dailyCount || 0) + 1;

    if (!isNewDay && nextCount > limit) {
      return { allowed: false, reason: docId.startsWith("company_") ? "company_limit" : "user_limit" };
    }

    tx.set(ref, { date: today, dailyCount: nextCount, lastRequestAt: Timestamp.now() });
    return { allowed: true };
  });
}

export async function checkRateLimit(uid: string, companyId: string): Promise<RateLimitResult> {
  const userResult = await checkAndIncrement(uid, USER_DAILY_LIMIT);
  if (!userResult.allowed) return userResult;

  const companyResult = await checkAndIncrement(`company_${companyId}`, COMPANY_DAILY_LIMIT);
  if (!companyResult.allowed) return companyResult;

  return { allowed: true };
}