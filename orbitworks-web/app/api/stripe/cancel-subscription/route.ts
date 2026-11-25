import { NextRequest, NextResponse } from "next/server";
import { canUseBilling } from "@/lib/stripe/billingAccess";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";
import { toClientMessage } from "@/lib/stripe/errors";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const companyId = decoded.companyId as string | undefined;

    // Task 4: owner, Full access, or the Billing permission.
    if (!companyId || !(await canUseBilling(decoded))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const companyRef = adminDb.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }
    const company = companySnap.data() as { stripeSubscriptionId?: string | null };

    if (!company.stripeSubscriptionId) {
      return NextResponse.json({ error: "No active subscription to cancel." }, { status: 400 });
    }

    await stripe.subscriptions.cancel(company.stripeSubscriptionId);

    // Firestore is updated by the customer.subscription.deleted webhook,
    // not here directly - the webhook remains the sole source of truth.

    return NextResponse.json({ success: true });
  } catch (err: any) {
    const { message, status } = toClientMessage(err, "cancel-subscription");
    return NextResponse.json({ error: message }, { status });
  }
}
