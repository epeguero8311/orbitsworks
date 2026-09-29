import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isProPlan } from "@/lib/stripe/tiers";
import { checkPlacesRateLimit } from "@/lib/places/rateLimit";
import { placesDetailsRequestSchema } from "@/lib/validators/places";

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
    const parsed = placesDetailsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const { placeId, sessionToken } = parsed.data;

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_PLACES_API_KEY is not configured.");
      return NextResponse.json({ error: "Address lookup is unavailable." }, { status: 500 });
    }

    // Field mask keeps this on the cheapest Place Details tier - only ever
    // request the three fields the site form actually needs.
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    let googleRes: Response;
    try {
      googleRes = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,formattedAddress,location",
        },
        signal: controller.signal,
      });
    } catch (err) {
      console.error("Places details request failed:", err);
      return NextResponse.json({ error: "Couldn't verify that address. Try again." }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!googleRes.ok) {
      console.error("Places details error:", googleRes.status, await googleRes.text());
      return NextResponse.json({ error: "Couldn't verify that address. Try again." }, { status: 502 });
    }

    const data = (await googleRes.json()) as {
      id?: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    };

    if (
      !data.id ||
      !data.formattedAddress ||
      data.location?.latitude == null ||
      data.location?.longitude == null
    ) {
      return NextResponse.json({ error: "Couldn't verify that address. Try again." }, { status: 502 });
    }

    return NextResponse.json({
      placeId: data.id,
      address: data.formattedAddress,
      lat: data.location.latitude,
      lng: data.location.longitude,
    });
  } catch (err) {
    console.error("Places details failed:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
