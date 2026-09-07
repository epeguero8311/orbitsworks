import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { stripe } from "@/lib/stripe/server";
import { getTierByKey } from "@/lib/stripe/tiers";

type InvoiceWithPaymentIntent = Stripe.Invoice & {
  payment_intent: Stripe.PaymentIntent | string | null;
};

function toClientMessage(err: unknown): { message: string; status: number } {
  if (err instanceof Stripe.errors.StripeCardError) {
    return { message: err.message || "Your card was declined.", status: 402 };
  }
  if (err instanceof Stripe.errors.StripeError) {
    console.error("Stripe config/request error:", err);
    return {
      message: "Something went wrong on our end. Please try again or contact support.",
      status: 500,
    };
  }
  console.error("Unexpected create-subscription error:", err);
  return { message: "Something went wrong. Please try again.", status: 500 };
}

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
      stripeSubscriptionId?: string | null;
      pendingPromotionCode?: string | null;
    };

    const pendingPromotionCode = company.pendingPromotionCode ?? null;

    async function clearPendingPromo() {
      if (pendingPromotionCode) {
        await companyRef.update({
          pendingPromotionCode: FieldValue.delete(),
          pendingPromotionCodeLabel: FieldValue.delete(),
        });
      }
    }

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

    if (company.stripeSubscriptionId) {
      const existingSub = await stripe.subscriptions.retrieve(company.stripeSubscriptionId);

      if (existingSub.status !== "canceled") {
        const itemId = existingSub.items.data[0]?.id;
        if (!itemId) {
          return NextResponse.json(
            { error: "Existing subscription has no items to update." },
            { status: 500 }
          );
        }

        const updatedSub = await stripe.subscriptions.update(
          company.stripeSubscriptionId,
          {
            items: [{ id: itemId, price: tier.priceId }],
            proration_behavior: "create_prorations",
            payment_behavior: "default_incomplete",
            payment_settings: { payment_method_types: ["card"] },
            expand: ["latest_invoice.payment_intent"],
            metadata: { companyId, tierKey: tier.key },
            ...(pendingPromotionCode
              ? { discounts: [{ promotion_code: pendingPromotionCode }] }
              : {}),
          },
          {
            idempotencyKey:
              "sub-update-" +
              company.stripeSubscriptionId +
              "-" +
              tier.key +
              "-" +
              Math.floor(Date.now() / 60000),
          }
        );

        await clearPendingPromo();

        const latestInvoice = updatedSub.latest_invoice as InvoiceWithPaymentIntent | string | null;
        const paymentIntent =
          typeof latestInvoice === "object" && latestInvoice?.payment_intent
            ? latestInvoice.payment_intent
            : null;
        const clientSecret =
          typeof paymentIntent === "object" && paymentIntent?.client_secret
            ? paymentIntent.client_secret
            : null;

        const piStatus =
          typeof paymentIntent === "object" && paymentIntent?.status
            ? paymentIntent.status
            : null;
        const needsConfirmation =
          piStatus === "requires_payment_method" ||
          piStatus === "requires_confirmation" ||
          piStatus === "requires_action";

        return NextResponse.json({
          clientSecret: needsConfirmation ? clientSecret : null,
          subscriptionId: updatedSub.id,
        });
      }
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
        ...(pendingPromotionCode
          ? { discounts: [{ promotion_code: pendingPromotionCode }] }
          : {}),
      },
      { idempotencyKey: `sub-create-${companyId}-${Math.floor(Date.now() / 60000)}` }
    );

    await companyRef.update({ stripeSubscriptionId: subscription.id });
    await clearPendingPromo();

    const latestInvoice = subscription.latest_invoice as InvoiceWithPaymentIntent | string | null;
    const paymentIntent =
      typeof latestInvoice === "object" && latestInvoice?.payment_intent
        ? latestInvoice.payment_intent
        : null;
    const clientSecret =
      typeof paymentIntent === "object" && paymentIntent?.client_secret
        ? paymentIntent.client_secret
        : null;

    return NextResponse.json({ clientSecret, subscriptionId: subscription.id });
  } catch (err: any) {
    const { message, status } = toClientMessage(err);
    return NextResponse.json({ error: message }, { status });
  }
}
