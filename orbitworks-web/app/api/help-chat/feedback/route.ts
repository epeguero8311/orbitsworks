import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { z } from "zod";

const feedbackSchema = z.object({
  question: z.string().min(1).max(1000),
  matchedDoc: z.string().min(1).max(200),
  thumbsUp: z.boolean(),
});

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let uid: string;
  let role: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
    role = decoded.role as string | undefined;
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  // Employee App logins are mobile-only and have no use for this route.
  if (role === "employee") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const userSnap = await adminDb.collection("users").doc(uid).get();
  const companyId = userSnap.data()?.companyId as string | undefined;
  if (!companyId) {
    return NextResponse.json({ error: "no_company" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  await adminDb.collection("helpChatFeedback").add({
    ...parsed.data,
    companyId,
    timestamp: new Date(),
  });

  return NextResponse.json({ ok: true });
}