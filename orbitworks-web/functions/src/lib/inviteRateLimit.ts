import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import type { Timestamp } from "firebase-admin/firestore";
import { db } from "../shared";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_INVITES = 20;
const RESEND_COOLDOWN_MS = 60 * 1000;

export async function checkInviteRateLimit(companyId: string): Promise<void> {
  const windowStart = admin.firestore.Timestamp.fromMillis(Date.now() - RATE_LIMIT_WINDOW_MS);

  const countSnap = await db
    .collection("invites")
    .where("companyId", "==", companyId)
    .where("createdAt", ">=", windowStart)
    .count()
    .get();

  if (countSnap.data().count >= RATE_LIMIT_MAX_INVITES) {
    throw new HttpsError(
      "resource-exhausted",
      "Too many invites sent in the last hour. Please wait before sending more."
    );
  }
}

export async function findExistingPendingInvite(
  companyId: string,
  email: string
): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();

  const querySnap = await db
    .collection("invites")
    .where("companyId", "==", companyId)
    .where("email", "==", normalizedEmail)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (querySnap.empty) return null;
  return querySnap.docs[0].id;
}

export function canResendEmail(lastEmailAttemptAt: Timestamp | null | undefined): boolean {
  if (!lastEmailAttemptAt) return true;
  return Date.now() - lastEmailAttemptAt.toMillis() >= RESEND_COOLDOWN_MS;
}
