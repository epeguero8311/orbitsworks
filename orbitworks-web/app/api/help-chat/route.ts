import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { helpChatRequestSchema } from "@/lib/validators/helpChat";
import { loadAllDocs, isGreeting, GREETING_RESPONSE } from "@/lib/help-chat/searchDocs";
import { selectDoc } from "@/lib/help-chat/selectDoc";
import { checkRateLimit } from "@/lib/help-chat/rateLimit";
import { askAI, askAINoMatch } from "@/lib/help-chat/askAI";

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

  // 6. Doc selection - an AI call instead of keyword scoring, so it matches
  // on meaning (and works in any language) rather than literal word overlap.
  let selectedDoc;
  try {
    selectedDoc = await selectDoc(question, loadAllDocs());
  } catch (err) {
    console.error("selectDoc failed:", err);
    await adminDb.collection("helpChatErrors").add({
      question,
      companyId,
      uid,
      errorMessage: err instanceof Error ? err.message : String(err),
      timestamp: new Date(),
    });
    return NextResponse.json({ answer: ERROR_FALLBACK_RESPONSE, matchedDoc: null });
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("SELECT DOC for:", question, "->", selectedDoc?.slug ?? "none");
  }

  // 7. True miss - still answer through the AI so the apology comes back
  // in the asked language instead of a hardcoded English string.
  if (!selectedDoc) {
    await adminDb.collection("helpChatMisses").add({
      question,
      companyId,
      timestamp: new Date(),
    });

    let noMatchAnswer: string;
    try {
      noMatchAnswer = await askAINoMatch(question, conversationHistory);
    } catch (err) {
      console.error("askAINoMatch failed:", err);
      return NextResponse.json({ answer: ERROR_FALLBACK_RESPONSE, matchedDoc: null });
    }
    return NextResponse.json({ answer: noMatchAnswer, matchedDoc: null });
  }

  // 8. AI call - wrapped so billing/outage/key issues degrade gracefully instead of a raw 500.
  let answer: string;
  try {
    answer = await askAI(question, selectedDoc, conversationHistory);
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

  // 9. Log the answered exchange for review.
  await adminDb.collection("helpChatLogs").add({
    question,
    matchedDocs: [selectedDoc.slug],
    answer,
    companyId,
    uid,
    timestamp: new Date(),
  });

  return NextResponse.json({ answer, matchedDoc: selectedDoc.slug });
}
