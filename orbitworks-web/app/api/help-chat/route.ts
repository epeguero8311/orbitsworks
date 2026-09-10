import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { helpChatRequestSchema } from "@/lib/validators/helpChat";
import { searchDocs, isGreeting, GREETING_RESPONSE, debugSearch } from "@/lib/help-chat/searchDocs";
import { checkRateLimit } from "@/lib/help-chat/rateLimit";
import { askAI } from "@/lib/help-chat/askAI";

const NO_MATCH_RESPONSE =
  "I couldn't find anything on that in the help docs yet. Try support@orbitsworks.com and we'll get you sorted.";

const ERROR_FALLBACK_RESPONSE =
  "Sorry, I'm having trouble right now. Please contact epeguero8311@gmail.com and we'll help you out.";

export async function POST(req: NextRequest) {
  // 1. Auth
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // 2. Subscription check (server-side only, never trust client)
  const userSnap = await adminDb.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    return NextResponse.json({ error: "no_user_record" }, { status: 403 });
  }
  const companyId = userSnap.data()?.companyId as string | undefined;
  if (!companyId) {
    return NextResponse.json({ error: "no_company" }, { status: 403 });
  }

  const companySnap = await adminDb.collection("companies").doc(companyId).get();
  const companyData = companySnap.data();
  if (companyData?.subscriptionStatus !== "active" || companyData?.planTier === "free") {
    return NextResponse.json({ error: "subscription_inactive" }, { status: 403 });
  }

  // 3. Rate limit
  const rateLimitResult = await checkRateLimit(uid, companyId);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: rateLimitResult.reason }, { status: 429 });
  }

  // 4. Validate body
  const body = await req.json();
  const parsed = helpChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { question, conversationHistory } = parsed.data;

  // 5. Greeting short-circuit (no AI call, no logging)
  if (isGreeting(question)) {
    return NextResponse.json({ answer: GREETING_RESPONSE, matchedDoc: null });
  }

  // 6. Doc search - now returns up to 3 candidates, not a single winner
  if (process.env.NODE_ENV !== "production") {
    console.log("SEARCH DEBUG for:", question);
    for (const r of debugSearch(question)) {
      console.log("  ", r.doc.slug, "score:", r.score);
    }
  }
  const matches = searchDocs(question);

  if (matches.length === 0) {
    await adminDb.collection("helpChatMisses").add({
      question,
      companyId,
      timestamp: new Date(),
    });
    return NextResponse.json({ answer: NO_MATCH_RESPONSE, matchedDoc: null });
  }

  // 7. AI call - wrapped so billing/outage/key issues degrade gracefully instead of a raw 500.
  // The AI now sees every candidate doc, not just the top-scored one, so it can
  // pick the right one (or combine them) instead of being locked into a bad ranking.
  let answer: string;
  try {
    answer = await askAI(question, matches.map((m) => m.doc), conversationHistory);
  } catch (err) {
    console.error("askAI failed:", err);
    await adminDb.collection("helpChatErrors").add({
      question,
      companyId,
      uid,
      errorMessage: err instanceof Error ? err.message : String(err),
      timestamp: new Date(),
    });
    return NextResponse.json({ answer: ERROR_FALLBACK_RESPONSE, matchedDoc: null });
  }

  // 8. Log the answered exchange for review.
  // matchedDocs (plural) is every candidate the AI actually saw - useful for
  // debugging ranking quality. matchedDoc (singular, top match) is what goes
  // back to the client, since the existing feedback UI is wired to one doc.
  const matchedDocs = matches.map((m) => m.doc.slug);
  await adminDb.collection("helpChatLogs").add({
    question,
    matchedDocs,
    answer,
    companyId,
    uid,
    timestamp: new Date(),
  });

  return NextResponse.json({ answer, matchedDoc: matchedDocs[0] });
}