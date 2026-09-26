import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { reverseGeocodeRequestSchema } from "@/lib/validators/geocode";

// Nominatim's usage policy requires a descriptive User-Agent naming the
// app and a real contact - same support address the help-chat fallback
// already points to.
const NOMINATIM_USER_AGENT = "OrbitsWorks/1.0 (contact: epeguero8311@gmail.com)";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const companyId = decoded.companyId as string | undefined;
    if (!companyId) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const parsed = reverseGeocodeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const { lat, lng, eventId } = parsed.data;

    const eventRef = adminDb
      .collection("companies")
      .doc(companyId)
      .collection("clockEvents")
      .doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Clock event not found." }, { status: 404 });
    }

    // Already resolved (a concurrent call, or a re-open of the same card) -
    // never geocode the same event twice.
    const existingAddress = eventSnap.data()?.locationAddress as string | undefined;
    if (existingAddress) {
      return NextResponse.json({ address: existingAddress });
    }

    const roundedLat = Math.round(lat * 1e5) / 1e5;
    const roundedLng = Math.round(lng * 1e5) / 1e5;

    const nominatimUrl =
      "https://nominatim.openstreetmap.org/reverse" +
      `?format=jsonv2&lat=${roundedLat}&lon=${roundedLng}`;

    const nominatimRes = await fetch(nominatimUrl, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
    });

    if (!nominatimRes.ok) {
      return NextResponse.json({ address: null });
    }

    const data = (await nominatimRes.json()) as { display_name?: string };
    const address = data.display_name ?? null;

    if (address) {
      await eventRef.update({ locationAddress: address }).catch((err) => {
        console.error("Failed to cache reverse geocode on clock event", eventId, err);
      });
    }

    return NextResponse.json({ address });
  } catch (err) {
    console.error("Reverse geocode failed:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
