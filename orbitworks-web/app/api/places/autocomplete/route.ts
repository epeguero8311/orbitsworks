import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isProPlan } from "@/lib/stripe/tiers";
import { checkPlacesRateLimit } from "@/lib/places/rateLimit";
import { placesAutocompleteRequestSchema } from "@/lib/validators/places";

// Google Places API (New) autocomplete response shape, trimmed to the
// fields this route actually reads.
interface GoogleSuggestion {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
  };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const companyId = decoded.companyId as string | undefined;
    const role = decoded.role as string | undefined;
    if (!companyId || (role !== "admin" && role !== "owner")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const companySnap = await adminDb.collection("companies").doc(companyId).get();
    if (!isProPlan(companySnap.data()?.planTier as string | undefined)) {
      return NextResponse.json({ error: "Address lookup requires the Pro plan." }, { status: 403 });
    }

    const rate = await checkPlacesRateLimit(decoded.uid, companyId);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests. Slow down and try again." }, { status: 429 });
    }

    const body = await request.json();
    const parsed = placesAutocompleteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const { input, sessionToken } = parsed.data;

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_PLACES_API_KEY is not configured.");
      return NextResponse.json({ error: "Address lookup is unavailable." }, { status: 500 });
    }

    // A hung Places request shouldn't hold this route open indefinitely -
    // same 5s-timeout convention as app/api/geocode/reverse/route.ts.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    let googleRes: Response;
    try {
      googleRes = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify({
          input,
          sessionToken,
          includedRegionCodes: ["us"],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      console.error("Places autocomplete request failed:", err);
      return NextResponse.json({ predictions: [] });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!googleRes.ok) {
      console.error("Places autocomplete error:", googleRes.status, await googleRes.text());
      return NextResponse.json({ predictions: [] });
    }

    const data = (await googleRes.json()) as { suggestions?: GoogleSuggestion[] };
    const predictions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter(
        (p): p is { placeId: string; text: { text: string } } =>
          !!p?.placeId && !!p.text?.text
      )
      .map((p) => ({ placeId: p.placeId, text: p.text.text }));

    // Only the two fields the dropdown/pick flow actually needs ever leave
    // this route - never Google's full raw prediction payload.
    return NextResponse.json({ predictions });
  } catch (err) {
    console.error("Places autocomplete failed:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
