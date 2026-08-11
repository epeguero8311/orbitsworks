import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";
import { getTierByKey } from "@/lib/stripe/tiers";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const role = decoded.role as string | undefined;
    const companyId = decoded.companyId as string | undefined;

    if (!companyId || role !== "admin") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const tierKey = typeof body?.tierKey === "string" ? body.tierKey : null;
    const tier = tierKey ? getTierByKey(tierKey) : null;

    if (!tier) {
      return NextResponse.json({ error: "Invalid tier." }, { status: 400 });
    }

    const companyRef = adminDb.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }
    const company = companySnap.data() as {
      name?: string;
      stripeCustomerId?: string | null;
    };

    let stripeCustomerId = company.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create(
        {
          name: company.name || undefined,
          metadata: { companyId },
        },
        { idempotencyKey: `customer-create-${companyId}` }
      );
      stripeCustomerId = customer.id;
      await companyRef.update({ stripeCustomerId });
    }

    const subscription = await stripe.subscriptions.create(
      {
        customer: stripeCustomerId,
        items: [{ price: tier.priceId }],
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
          payment_method_types: ["card"],
        },
        expand: ["latest_invoice.payment_intent"],
        metadata: { companyId, tierKey: tier.key },
      },
      { idempotencyKey: `sub-create-${companyId}-${tier.key}-${Date.now()}` }
    );

    await companyRef.update({ stripeSubscriptionId: subscription.id });

    const latestInvoice = subscription.latest_invoice;
    const paymentIntent =
      typeof latestInvoice === "object" && latestInvoice?.payment_intent
        ? latestInvoice.payment_intent
        : null;
    const clientSecret =
      typeof paymentIntent === "object" && paymentIntent?.client_secret
        ? paymentIntent.client_secret
        : null;

    if (!clientSecret) {
      return NextResponse.json(
        { error: "Could not create payment intent for subscription." },
        { status: 500 }
      );
    }

    return NextResponse.json({ clientSecret, subscriptionId: subscription.id });
  } catch (err: any) {
    console.error("create-subscription error:", err);
    return NextResponse.json(
      { error: err?.message || "Something went wrong." },
      { status: 500 }
    );
  }
}
