import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { getTierByPriceId } from "@/lib/stripe/tiers";
import { adminDb } from "@/lib/firebase/admin";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToFirestore(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.companyId;
        if (companyId) {
          await adminDb.collection("companies").doc(companyId).update({
            subscriptionStatus: "canceled",
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const companyId = subscription.metadata?.companyId;
          if (companyId) {
            await adminDb.collection("companies").doc(companyId).update({
              subscriptionStatus: "past_due",
            });
          }
        }
        break;
      }

      default:
        // Unhandled event types are fine to ignore.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }
}

async function syncSubscriptionToFirestore(subscription: Stripe.Subscription) {
  const companyId = subscription.metadata?.companyId;
  if (!companyId) {
    console.error("Subscription has no companyId in metadata:", subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id;
  const tier = priceId ? getTierByPriceId(priceId) : null;

  const update: Record<string, unknown> = {
    subscriptionStatus: subscription.status,
    stripeSubscriptionId: subscription.id,
  };

  // Only flip planTier/employeeCap once the subscription is actually
  // active or trialing on Stripe's side - never on incomplete/canceled.
  if (tier && (subscription.status === "active" || subscription.status === "trialing")) {
    update.planTier = tier.key;
    update.employeeCap = tier.employeeCap;
  }

  await adminDb.collection("companies").doc(companyId).update(update);
}
